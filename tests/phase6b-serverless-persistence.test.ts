import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  isMessageProcessed,
  markMessageProcessed,
  DEDUPLICATION_TTL_MS,
} from "../src/lib/whatsapp/security";
import {
  getWhatsAppSession,
  setActiveActionToken,
  clearActiveActionToken,
  addMessageToSession,
  deleteWhatsAppSession,
  SESSION_TTL_MS,
  MAX_HISTORY_LENGTH,
} from "../src/lib/whatsapp/session";
import {
  createPendingAction,
  getAndConsumePendingAction,
  cancelPendingAction,
  ACTION_TTL_MS,
} from "../src/lib/ai/pending-actions";
import { cleanupExpiredServerlessState } from "../src/lib/cleanup";

describe("Phase 6B: Persistent Serverless State (PostgreSQL & Prisma)", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let bizA: { id: string; name: string };
  let bizB: { id: string; name: string };

  const phoneA = `234807777${Math.floor(1000 + Math.random() * 9000)}`;
  const phoneB = `234808888${Math.floor(1000 + Math.random() * 9000)}`;

  beforeAll(async () => {
    const hashedPassword = await hashPassword("TestPass123!");

    userA = await prisma.user.create({
      data: {
        email: `p6b_user_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Serverless User A",
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `p6b_user_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Serverless User B",
      },
    });

    bizA = await prisma.business.create({
      data: {
        name: "Serverless Enterprise A",
        slug: `serverless-a-${Date.now()}`,
        currency: "NGN",
      },
    });

    bizB = await prisma.business.create({
      data: {
        name: "Serverless Enterprise B",
        slug: `serverless-b-${Date.now()}`,
        currency: "NGN",
      },
    });

    await prisma.membership.create({
      data: { userId: userA.id, businessId: bizA.id, role: "OWNER" },
    });

    await prisma.membership.create({
      data: { userId: userB.id, businessId: bizB.id, role: "OWNER" },
    });
  });

  afterAll(async () => {
    await prisma.whatsAppProcessedMessage.deleteMany({
      where: { businessId: { in: [bizA.id, bizB.id] } },
    });
    await prisma.whatsAppConversationSession.deleteMany({
      where: { phoneNumber: { in: [phoneA, phoneB] } },
    });
    await prisma.aIPendingAction.deleteMany({
      where: { businessId: { in: [bizA.id, bizB.id] } },
    });
    await prisma.membership.deleteMany({
      where: { businessId: { in: [bizA.id, bizB.id] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [bizA.id, bizB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.$disconnect();
  });

  // ─── 1. WhatsApp Message Deduplication (PostgreSQL Persistence) ───────────
  describe("1. Persistent WhatsApp Message Deduplication", () => {
    it("should accept a new message ID on first receipt", async () => {
      const msgId = `wamid.p6b_test_${Date.now()}_1`;
      const processed = await isMessageProcessed(msgId);
      expect(processed).toBe(false);
    });

    it("should reject/deduplicate a processed message ID", async () => {
      const msgId = `wamid.p6b_test_${Date.now()}_2`;
      await markMessageProcessed(msgId, bizA.id);

      const processed = await isMessageProcessed(msgId);
      expect(processed).toBe(true);

      // Verify record exists in PostgreSQL
      const dbRecord = await prisma.whatsAppProcessedMessage.findUnique({
        where: { messageId: msgId },
      });
      expect(dbRecord).toBeDefined();
      expect(dbRecord?.businessId).toBe(bizA.id);
    });

    it("should allow re-processing of an expired deduplication record (> 1 hour)", async () => {
      const msgId = `wamid.p6b_test_${Date.now()}_expired`;
      const oldDate = new Date(Date.now() - (DEDUPLICATION_TTL_MS + 60000)); // 1 hr 1 min ago

      await prisma.whatsAppProcessedMessage.create({
        data: {
          messageId: msgId,
          businessId: bizA.id,
          createdAt: oldDate,
        },
      });

      // Expired record should not block processing
      const processed = await isMessageProcessed(msgId);
      expect(processed).toBe(false);
    });

    it("should safely handle concurrent markMessageProcessed calls without unhandled collision error", async () => {
      const msgId = `wamid.p6b_concurrent_${Date.now()}`;

      // Simulate 5 simultaneous webhook deliveries
      await Promise.all([
        markMessageProcessed(msgId, bizA.id),
        markMessageProcessed(msgId, bizA.id),
        markMessageProcessed(msgId, bizA.id),
        markMessageProcessed(msgId, bizA.id),
        markMessageProcessed(msgId, bizA.id),
      ]);

      const count = await prisma.whatsAppProcessedMessage.count({
        where: { messageId: msgId },
      });
      expect(count).toBe(1);
    });
  });

  // ─── 2. WhatsApp Conversation Sessions (PostgreSQL Persistence) ────────────
  describe("2. Persistent WhatsApp Conversation Sessions", () => {
    it("should create, persist, and retrieve session from PostgreSQL", async () => {
      const session = await getWhatsAppSession(phoneA, bizA.id);
      expect(session.phoneNumber).toBe(phoneA);
      expect(session.conversationHistory).toEqual([]);

      const dbRecord = await prisma.whatsAppConversationSession.findUnique({
        where: { phoneNumber: phoneA },
      });
      expect(dbRecord).toBeDefined();
      expect(dbRecord?.businessId).toBe(bizA.id);
    });

    it("should append messages and preserve conversation history in PostgreSQL", async () => {
      await addMessageToSession(phoneA, {
        id: "msg-1",
        role: "user",
        content: "What were my sales today?",
        timestamp: new Date().toISOString(),
      });

      await addMessageToSession(phoneA, {
        id: "msg-2",
        role: "assistant",
        content: "Your total sales today are ₦45,000.",
        timestamp: new Date().toISOString(),
      });

      const session = await getWhatsAppSession(phoneA);
      expect(session.conversationHistory.length).toBe(2);
      expect(session.conversationHistory[0].content).toBe("What were my sales today?");
      expect(session.conversationHistory[1].content).toBe("Your total sales today are ₦45,000.");
    });

    it("should cap conversation history at MAX_HISTORY_LENGTH (6)", async () => {
      for (let i = 3; i <= 10; i++) {
        await addMessageToSession(phoneA, {
          id: `msg-${i}`,
          role: i % 2 === 0 ? "assistant" : "user",
          content: `Test message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const session = await getWhatsAppSession(phoneA);
      expect(session.conversationHistory.length).toBe(MAX_HISTORY_LENGTH);
      expect(session.conversationHistory[session.conversationHistory.length - 1].content).toBe("Test message 10");
    });

    it("should persist and clear activeActionToken", async () => {
      const testToken = "act_test_sample_token_123";
      await setActiveActionToken(phoneA, testToken);

      let session = await getWhatsAppSession(phoneA);
      expect(session.activeActionToken).toBe(testToken);

      await clearActiveActionToken(phoneA);
      session = await getWhatsAppSession(phoneA);
      expect(session.activeActionToken).toBeUndefined();
    });

    it("should reset history and token when session expires (> 15 mins)", async () => {
      const testToken = "act_expired_session_token";
      await setActiveActionToken(phoneA, testToken);

      // Force lastActivity to 20 minutes ago
      const staleTime = new Date(Date.now() - (SESSION_TTL_MS + 5 * 60 * 1000));
      await prisma.whatsAppConversationSession.update({
        where: { phoneNumber: phoneA },
        data: { lastActivity: staleTime },
      });

      const session = await getWhatsAppSession(phoneA);
      expect(session.conversationHistory).toEqual([]);
      expect(session.activeActionToken).toBeUndefined();
    });

    it("should maintain strict isolation between different phone sessions", async () => {
      await addMessageToSession(phoneB, {
        id: "msg-phone-b",
        role: "user",
        content: "Confidential Business B Message",
        timestamp: new Date().toISOString(),
      });

      const sessionA = await getWhatsAppSession(phoneA);
      const sessionB = await getWhatsAppSession(phoneB);

      expect(sessionB.conversationHistory.some((m) => m.content.includes("Business B"))).toBe(true);
      expect(sessionA.conversationHistory.some((m) => m.content.includes("Business B"))).toBe(false);
    });

    it("should delete session row on deleteWhatsAppSession", async () => {
      await deleteWhatsAppSession(phoneB);

      const dbRecord = await prisma.whatsAppConversationSession.findUnique({
        where: { phoneNumber: phoneB },
      });
      expect(dbRecord).toBeNull();
    });
  });

  // ─── 3. AI Pending Actions (PostgreSQL Persistence & Single-Use Semantics) ───
  describe("3. Persistent AI Pending Actions & Atomic Single-Use Vouchers", () => {
    it("should create and persist a pending action voucher in PostgreSQL", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Stationery",
            amount: 7500,
            description: "Office supplies",
            date: "2026-09-03",
          },
        }
      );

      expect(token).toMatch(/^act_[0-9a-f]{48}$/);

      const dbRecord = await prisma.aIPendingAction.findUnique({
        where: { token },
      });
      expect(dbRecord).toBeDefined();
      expect(dbRecord?.userId).toBe(userA.id);
      expect(dbRecord?.businessId).toBe(bizA.id);
      expect(dbRecord?.consumedAt).toBeNull();
    });

    it("should successfully consume a valid pending action and mark consumedAt atomically", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Logistics",
            amount: 12000,
            description: "Delivery fee",
            date: "2026-09-03",
          },
        }
      );

      const consumed = await getAndConsumePendingAction(token, userA.id, bizA.id);
      expect(consumed.token).toBe(token);
      expect(consumed.used).toBe(true);
      expect(consumed.payload.type).toBe("CREATE_EXPENSE");

      // Verify PostgreSQL record has consumedAt set
      const dbRecord = await prisma.aIPendingAction.findUnique({
        where: { token },
      });
      expect(dbRecord?.consumedAt).not.toBeNull();
    });

    it("should reject an already-consumed action token (Replay Attack Prevention)", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Maintenance",
            amount: 5000,
            description: "AC repair",
            date: "2026-09-03",
          },
        }
      );

      // First consume: success
      await getAndConsumePendingAction(token, userA.id, bizA.id);

      // Second consume: must throw
      await expect(
        getAndConsumePendingAction(token, userA.id, bizA.id)
      ).rejects.toThrow(/already been confirmed/i);
    });

    it("should prevent double-spending under concurrent consumption requests", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Utilities",
            amount: 30000,
            description: "Concurrent double-spend test",
            date: "2026-09-03",
          },
        }
      );

      // Attempt 10 simultaneous consumption executions
      const results = await Promise.allSettled(
        Array.from({ length: 10 }).map(() =>
          getAndConsumePendingAction(token, userA.id, bizA.id)
        )
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly ONE must succeed
      expect(fulfilled.length).toBe(1);
      // All other 9 must fail
      expect(rejected.length).toBe(9);
    });

    it("should reject expired pending action tokens (> 5 minutes)", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Rent",
            amount: 100000,
            description: "Expired action test",
            date: "2026-09-03",
          },
        },
        -1000 // Expired 1 second ago
      );

      await expect(
        getAndConsumePendingAction(token, userA.id, bizA.id)
      ).rejects.toThrow(/expired/i);
    });

    it("should reject cross-tenant action consumption (Business B cannot consume Business A token)", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Supplies",
            amount: 15000,
            description: "Biz A private action",
            date: "2026-09-03",
          },
        }
      );

      // Business B / User B tries to consume Biz A's voucher
      await expect(
        getAndConsumePendingAction(token, userB.id, bizB.id)
      ).rejects.toThrow(/Security violation/i);

      // Same User A but mismatched Business B context
      await expect(
        getAndConsumePendingAction(token, userA.id, bizB.id)
      ).rejects.toThrow(/Security violation/i);
    });

    it("should successfully cancel a pending action token", async () => {
      const token = await createPendingAction(
        userA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Other",
            amount: 2000,
            description: "Action to be cancelled",
            date: "2026-09-03",
          },
        }
      );

      const cancelled = await cancelPendingAction(token, userA.id, bizA.id);
      expect(cancelled).toBe(true);

      // Token should no longer exist
      await expect(
        getAndConsumePendingAction(token, userA.id, bizA.id)
      ).rejects.toThrow(/not found or expired/i);
    });
  });

  // ─── 4. Maintenance / Storage Cleanup ─────────────────────────────────────
  describe("4. Maintenance / Storage Cleanup", () => {
    it("should clean expired records while preserving active state", async () => {
      // 1. Create stale message (> 2 hours old)
      const staleMsgId = `wamid.stale_${Date.now()}`;
      await prisma.whatsAppProcessedMessage.create({
        data: {
          messageId: staleMsgId,
          businessId: bizA.id,
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
        },
      });

      // 2. Create fresh message (active)
      const freshMsgId = `wamid.fresh_${Date.now()}`;
      await markMessageProcessed(freshMsgId, bizA.id);

      // 3. Create stale consumed action (> 24 hours ago)
      const staleActionToken = `act_stale_${Date.now()}`;
      await prisma.aIPendingAction.create({
        data: {
          token: staleActionToken,
          userId: userA.id,
          businessId: bizA.id,
          actionType: "CREATE_EXPENSE",
          payload: { type: "CREATE_EXPENSE", data: { category: "Old", amount: 100, description: null, date: "2026-09-01" } },
          expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          consumedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        },
      });

      // Run cleanup
      const result = await cleanupExpiredServerlessState();
      expect(result.deletedProcessedMessages).toBeGreaterThanOrEqual(1);

      // Stale message is deleted
      const staleMsg = await prisma.whatsAppProcessedMessage.findUnique({
        where: { messageId: staleMsgId },
      });
      expect(staleMsg).toBeNull();

      // Fresh message remains
      const freshMsg = await prisma.whatsAppProcessedMessage.findUnique({
        where: { messageId: freshMsgId },
      });
      expect(freshMsg).not.toBeNull();

      // Stale action is deleted
      const staleAction = await prisma.aIPendingAction.findUnique({
        where: { token: staleActionToken },
      });
      expect(staleAction).toBeNull();
    });
  });
});
