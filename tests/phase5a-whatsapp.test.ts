import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import crypto from "crypto";
import {
  verifyWhatsAppSignature,
  isMessageProcessed,
  markMessageProcessed,
  normalizePhoneNumber,
  checkRateLimit,
  resetRateLimits,
} from "../src/lib/whatsapp/security";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";
import {
  getWhatsAppSession,
  setActiveActionToken,
} from "../src/lib/whatsapp/session";
import { createPendingAction } from "../src/lib/ai/pending-actions";

describe("Phase 5A: WhatsApp Foundation & Webhook Architecture", () => {
  let testUser1: { id: string; name: string | null; email: string };
  let testBiz1: { id: string; name: string; currency: string };
  let testBiz2: { id: string; name: string; currency: string };
  let sampleCustomer: { id: string; name: string };
  let sampleProduct: { id: string; name: string; sku: string; stockQuantity: number };

  const phone1 = "2348011112222";
  const phone2 = "2348033334444";
  const unlinkedPhone = "2348099999999";
  const mockSecret = "test_whatsapp_secret_key_123456";

  beforeAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!user || !biz1 || !biz2) {
      throw new Error("Seeded test data missing for WhatsApp tests!");
    }

    testUser1 = { id: user.id, name: user.name, email: user.email };
    testBiz1 = { id: biz1.id, name: biz1.name, currency: biz1.currency };
    testBiz2 = { id: biz2.id, name: biz2.name, currency: biz2.currency };

    const cust = await prisma.customer.findFirst({ where: { businessId: biz1.id } });
    if (!cust) throw new Error("Customer missing for Acme Electronics!");
    sampleCustomer = { id: cust.id, name: cust.name };

    const prod = await prisma.product.findFirst({ where: { businessId: biz1.id } });
    if (!prod) throw new Error("Product missing for Acme Electronics!");
    sampleProduct = {
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      stockQuantity: prod.stockQuantity,
    };

    // Upsert WhatsAppConnection records for test
    await prisma.whatsAppConnection.upsert({
      where: { phoneNumber: phone1 },
      create: {
        phoneNumber: phone1,
        userId: testUser1.id,
        businessId: testBiz1.id,
        verified: true,
      },
      update: {
        userId: testUser1.id,
        businessId: testBiz1.id,
        verified: true,
      },
    });

    await prisma.whatsAppConnection.upsert({
      where: { phoneNumber: phone2 },
      create: {
        phoneNumber: phone2,
        userId: testUser1.id,
        businessId: testBiz2.id,
        verified: true,
      },
      update: {
        userId: testUser1.id,
        businessId: testBiz2.id,
        verified: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup created connections
    await prisma.whatsAppConnection.deleteMany({
      where: { phoneNumber: { in: [phone1, phone2] } },
    });
    await prisma.$disconnect();
  });

  describe("1. Security: Signature Validation, Phone Normalization, Rate Limiting & Idempotency", () => {
    it("should validate HMAC SHA-256 webhook signatures accurately", () => {
      const payload = JSON.stringify({ object: "whatsapp_business_account" });
      const signature = crypto.createHmac("sha256", mockSecret).update(payload, "utf8").digest("hex");
      const signatureHeader = `sha256=${signature}`;

      const isValid = verifyWhatsAppSignature(payload, signatureHeader, mockSecret);
      expect(isValid).toBe(true);

      const isInvalid = verifyWhatsAppSignature(payload, "sha256=invalidhexsignature9999", mockSecret);
      expect(isInvalid).toBe(false);

      const isMissing = verifyWhatsAppSignature(payload, null, mockSecret);
      expect(isMissing).toBe(false);
    });

    it("should fail-closed in production when WHATSAPP_APP_SECRET is not configured", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.WHATSAPP_APP_SECRET;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.WHATSAPP_APP_SECRET;

        const payload = JSON.stringify({ object: "whatsapp_business_account" });
        const result = verifyWhatsAppSignature(payload, "sha256=abcdef1234567890", undefined);

        // Must strictly fail in production when secret is missing
        expect(result).toBe(false);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
        if (originalSecret) process.env.WHATSAPP_APP_SECRET = originalSecret;
      }
    });

    it("should verify webhook GET challenge when WHATSAPP_VERIFY_TOKEN matches and reject when mismatched or missing", async () => {
      const { GET } = await import("../src/app/api/webhook/whatsapp/route");
      const originalToken = process.env.WHATSAPP_VERIFY_TOKEN;

      try {
        process.env.WHATSAPP_VERIFY_TOKEN = "test_custom_verify_token_987";

        // 1. Matching token should return challenge (200)
        const validReq = new Request("http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test_custom_verify_token_987&hub.challenge=test_challenge_12345");
        const validRes = await GET(validReq as any);
        expect(validRes.status).toBe(200);
        const validBody = await validRes.text();
        expect(validBody).toBe("test_challenge_12345");

        // 2. Mismatched token should return 403 Forbidden
        const invalidReq = new Request("http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_12345");
        const invalidRes = await GET(invalidReq as any);
        expect(invalidRes.status).toBe(403);

        // 3. Missing configured token on server should return 403 Forbidden (no hardcoded fallback)
        delete process.env.WHATSAPP_VERIFY_TOKEN;
        const noServerTokenReq = new Request("http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=bizpilot_wa_verify_secret_2026&hub.challenge=test_challenge_12345");
        const noServerTokenRes = await GET(noServerTokenReq as any);
        expect(noServerTokenRes.status).toBe(403);
      } finally {
        if (originalToken) process.env.WHATSAPP_VERIFY_TOKEN = originalToken;
      }
    });

    it("should normalize Nigerian phone numbers to standard E.164 digits without '+'", () => {
      expect(normalizePhoneNumber("+234 801 234 5678")).toBe("2348012345678");
      expect(normalizePhoneNumber("08012345678")).toBe("2348012345678");
      expect(normalizePhoneNumber("2348012345678")).toBe("2348012345678");
    });

    it("should prevent duplicate processing of the same messageId (idempotency)", () => {
      const messageId = `wamid.test_${Date.now()}`;
      expect(isMessageProcessed(messageId)).toBe(false);

      markMessageProcessed(messageId);
      expect(isMessageProcessed(messageId)).toBe(true);
    });

    it("should enforce sliding-window rate limit per phone number", () => {
      const spamPhone = "2348000000099";
      // Limit is 30 per minute
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(spamPhone, 30)).toBe(true);
      }
      // 31st request must be rejected
      expect(checkRateLimit(spamPhone, 30)).toBe(false);
    });
  });

  describe("2. Sender Identity & Tenant Isolation via WhatsApp", () => {
    it("should return onboarding guidance when sender number is not linked to any business", async () => {
      const result = await handleIncomingWhatsAppMessage(unlinkedPhone, "What were my sales today?");

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("UNLINKED");
      expect(result.replySent).toContain("not yet linked");
    });

    it("should resolve registered phone number to authenticated business and answer queries", async () => {
      const result = await handleIncomingWhatsAppMessage(phone1, "What were my sales today?");

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("QUERY");
      expect(result.replySent).toBeDefined();
    });

    it("should isolate tenants between different phone numbers (Phone 1: Acme vs Phone 2: Beta)", async () => {
      // In Beta Retailers (phone2), sales are 0
      const betaResult = await handleIncomingWhatsAppMessage(phone2, "Show my sales this month");
      expect(betaResult.success).toBe(true);
      expect(betaResult.actionTaken).toBe("QUERY");
      expect(betaResult.replySent).toContain("0");

      // In Beta Retailers (phone2), Acme's customer does not exist
      const crossDraft = await handleIncomingWhatsAppMessage(
        phone2,
        `Create an invoice for ${sampleCustomer.name} for 2 items`
      );
      expect(crossDraft.replySent).toContain("not found in your business directory");
    });
  });

  describe("3. WhatsApp Action Previews & Confirmation UX", () => {
    it("should generate formatted invoice preview with Reply 1 / 2 instructions", async () => {
      const result = await handleIncomingWhatsAppMessage(
        phone1,
        `Create an invoice for ${sampleCustomer.name} for 2 ${sampleProduct.name}`
      );

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("ACTION_PREVIEW");
      expect(result.replySent).toContain("Invoice Preview");
      expect(result.replySent).toContain(`Customer: ${sampleCustomer.name}`);
      expect(result.replySent).toContain("Reply 1 to confirm");
      expect(result.replySent).toContain("Reply 2 to cancel");

      // Session should have active action token
      const session = getWhatsAppSession(phone1);
      expect(session.activeActionToken).toBeDefined();
    });

    it("should confirm invoice creation when user replies '1'", async () => {
      // 1. Prepare preview
      await handleIncomingWhatsAppMessage(
        phone1,
        `Create an invoice for ${sampleCustomer.name} for 1 ${sampleProduct.name}`
      );

      // 2. Reply "1" to confirm
      const confirmRes = await handleIncomingWhatsAppMessage(phone1, "1");

      expect(confirmRes.success).toBe(true);
      expect(confirmRes.actionTaken).toBe("CONFIRMED");
      expect(confirmRes.replySent).toContain("✅ Invoice created successfully!");
      expect(confirmRes.replySent).toContain(`Customer: ${sampleCustomer.name}`);
      expect(confirmRes.replySent).toContain("Invoice: INV-");

      // Token should be cleared from session
      const session = getWhatsAppSession(phone1);
      expect(session.activeActionToken).toBeUndefined();
    });

    it("should confirm invoice creation when user replies 'CONFIRM'", async () => {
      // 1. Prepare preview
      await handleIncomingWhatsAppMessage(
        phone1,
        `Create an invoice for ${sampleCustomer.name} for 1 ${sampleProduct.name}`
      );

      // 2. Reply "CONFIRM" to confirm
      const confirmRes = await handleIncomingWhatsAppMessage(phone1, "CONFIRM");

      expect(confirmRes.success).toBe(true);
      expect(confirmRes.actionTaken).toBe("CONFIRMED");
      expect(confirmRes.replySent).toContain("✅ Invoice created successfully!");
    });

    it("should cancel action when user replies '2'", async () => {
      // 1. Prepare preview
      await handleIncomingWhatsAppMessage(
        phone1,
        `Create an invoice for ${sampleCustomer.name} for 1 ${sampleProduct.name}`
      );

      // 2. Reply "2" to cancel
      const cancelRes = await handleIncomingWhatsAppMessage(phone1, "2");

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.actionTaken).toBe("CANCELLED");
      expect(cancelRes.replySent).toContain("Action was cancelled");

      // Active token cleared
      const session = getWhatsAppSession(phone1);
      expect(session.activeActionToken).toBeUndefined();
    });

    it("should cancel action when user replies 'CANCEL'", async () => {
      // 1. Prepare preview
      await handleIncomingWhatsAppMessage(
        phone1,
        `Create an invoice for ${sampleCustomer.name} for 1 ${sampleProduct.name}`
      );

      // 2. Reply "CANCEL" to cancel
      const cancelRes = await handleIncomingWhatsAppMessage(phone1, "CANCEL");

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.actionTaken).toBe("CANCELLED");
      expect(cancelRes.replySent).toContain("Action was cancelled");
    });
  });

  describe("4. Security Invariants: Replay Protection, Expiration, and Stock Verification", () => {
    it("should reject expired pending action on WhatsApp confirmation", async () => {
      // Create expired token (-1000ms TTL)
      const expiredToken = createPendingAction(
        testUser1.id,
        testBiz1.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 1500, description: "Expired test", date: "2026-08-21" },
        },
        -1000
      );

      setActiveActionToken(phone1, expiredToken);

      const res = await handleIncomingWhatsAppMessage(phone1, "1");
      expect(res.success).toBe(false);
      expect(res.replySent).toContain("expired");
    });

    it("should reject confirmation replay attack (token cannot be consumed twice)", async () => {
      // 1. Prepare preview
      await handleIncomingWhatsAppMessage(
        phone1,
        `Record ₦2,500 for generator fuel`
      );

      const session = getWhatsAppSession(phone1);
      const token = session.activeActionToken!;

      // 2. First confirm: success
      const res1 = await handleIncomingWhatsAppMessage(phone1, "1");
      expect(res1.success).toBe(true);

      // 3. Simulated replay attack: Attacker resets session token and sends "1" again
      setActiveActionToken(phone1, token);
      const res2 = await handleIncomingWhatsAppMessage(phone1, "1");
      expect(res2.success).toBe(false);
      expect(res2.replySent).toContain("already been confirmed");
    });

    it("should reject confirmation attempt from a different WhatsApp user / business context", async () => {
      // Token created for User 1 / Biz 1
      const token = createPendingAction(
        testUser1.id,
        testBiz1.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Rent", amount: 50000, description: "Cross user test", date: "2026-08-21" },
        }
      );

      // Attacker on Phone 2 (Beta Retailers context) tries to confirm Phone 1's token
      setActiveActionToken(phone2, token);
      const res = await handleIncomingWhatsAppMessage(phone2, "1");

      expect(res.success).toBe(false);
      expect(res.replySent).toContain("Security violation");
    });

    it("should re-verify live stock at confirmation time during WhatsApp sale creation", async () => {
      // Create a temporary product with stock = 1
      const tempProd = await prisma.product.create({
        data: {
          businessId: testBiz1.id,
          name: `WhatsApp Stock Test Product ${Date.now()}`,
          sku: `WST-${Date.now()}`,
          sellingPrice: "3000.00",
          costPrice: "1500.00",
          stockQuantity: 1,
        },
      });

      // 1. Prepare sale preview for 1 item (passes stock check)
      await handleIncomingWhatsAppMessage(
        phone1,
        `Sell 1 ${tempProd.name} for cash`
      );

      // 2. Simulate another concurrent purchase changing stock to 0
      await prisma.product.update({
        where: { id: tempProd.id },
        data: { stockQuantity: 0 },
      });

      // 3. User replies "1" to confirm
      const res = await handleIncomingWhatsAppMessage(phone1, "1");

      // Must fail safely due to live stock re-check
      expect(res.success).toBe(false);
      expect(res.replySent).toContain("Insufficient stock");

      // Cleanup
      await prisma.product.delete({ where: { id: tempProd.id } });
    });
  });

  describe("5. WhatsApp Greetings, Menus & Non-Text Messages", () => {
    it("1. 'Hello BizPilot' returns the greeting", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Hello BizPilot");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("BizPilot AI Assistant");
      expect(res.replySent).toContain("Acme Electronics");
      expect(res.replySent).toContain("What were my sales today?");
    });

    it("2. 'Hi' returns the greeting", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Hi");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("BizPilot AI Assistant");
      expect(res.replySent).toContain("How can I help you today?");
    });

    it("3. 'What can you do?' returns the help/greeting response", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "What can you do?");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("BizPilot AI Assistant");
      expect(res.replySent).toContain("What were my sales today?");
    });

    it("should handle empty or whitespace message with prompt to send text", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "   ");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("Please send your question as text");
    });
  });

  describe("6. Read-Only Business Queries via WhatsApp & Regression Routing", () => {
    it("4. 'What were my sales today?' does NOT return greeting and reaches sales logic", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "What were my sales today?");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      // Must NOT contain the menu introduction greeting
      expect(res.replySent).not.toContain("How can I help you today?");
      expect(res.replySent).not.toContain("You can ask me questions about your business in plain English");
      // Must contain sales summary information
      expect(res.replySent).toContain("sales");
      expect(res.replySent).toContain("sales activity and revenue summary");
    });

    it("5. 'Show me my low-stock products' reaches the business-query logic", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Show me my low-stock products");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).not.toContain("How can I help you today?");
      expect(res.replySent).toContain("low-stock");
    });

    it("6. 'How much did I spend this month?' reaches the expense/business-query logic", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "How much did I spend this month?");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).not.toContain("How can I help you today?");
      expect(res.replySent).toContain("expense");
    });

    it("should answer top customers questions over WhatsApp", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Who are my top customers?");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).not.toContain("How can I help you today?");
      expect(res.replySent).toContain("customer");
    });

    it("should answer invoice status questions over WhatsApp", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Show unpaid invoices");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).not.toContain("How can I help you today?");
      expect(res.replySent).toContain("invoice");
    });

    it("should route 'Show my sales' to read-only tool", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Show my sales");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("sales activity and revenue summary");
    });

    it("should route 'What are my best selling products?' to read-only tool", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "What are my best selling products?");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("Top-Selling Products");
    });

    it("should route 'Give me my sales summary' to read-only tool", async () => {
      const res = await handleIncomingWhatsAppMessage(phone1, "Give me my sales summary");

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("QUERY");
      expect(res.replySent).toContain("Business Overview");
    });
  });

  describe("7. WhatsApp Write Intent Routing (Sale, Expense, Invoice)", () => {
    beforeAll(() => {
      resetRateLimits();
    });
    it("should route 'Record a sale of 2 units of [product] for ₦5000' to PREPARE_ACTION preview", async () => {
      const res = await handleIncomingWhatsAppMessage(
        phone1,
        `Record a sale of 2 units of ${sampleProduct.name} for ₦5000`
      );

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("ACTION_PREVIEW");
      expect(res.replySent).toContain("Sale Preview");
      expect(res.replySent).toContain(sampleProduct.name);
      expect(res.replySent).toContain("Reply 1 to confirm");
      expect(res.replySent).toContain("Reply 2 to cancel");

      // Verify token created
      const session = getWhatsAppSession(phone1);
      expect(session.activeActionToken).toBeDefined();
    });

    it("should route 'Add a sale of 2 units of [product]' to PREPARE_ACTION preview", async () => {
      const res = await handleIncomingWhatsAppMessage(
        phone1,
        `Add a sale of 2 units of ${sampleProduct.name}`
      );

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("ACTION_PREVIEW");
      expect(res.replySent).toContain("Sale Preview");
      expect(res.replySent).toContain(sampleProduct.name);
    });

    it("should route 'Sell 2 units of [product]' to PREPARE_ACTION preview", async () => {
      const res = await handleIncomingWhatsAppMessage(
        phone1,
        `Sell 2 units of ${sampleProduct.name}`
      );

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("ACTION_PREVIEW");
      expect(res.replySent).toContain("Sale Preview");
      expect(res.replySent).toContain(sampleProduct.name);
    });

    it("should route 'Record an expense of ₦5000 for generator fuel' to PREPARE_ACTION preview", async () => {
      const res = await handleIncomingWhatsAppMessage(
        phone1,
        "Record an expense of ₦5000 for generator fuel"
      );

      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("ACTION_PREVIEW");
      expect(res.replySent).toContain("Expense Preview");
      expect(res.replySent).toContain("5,000");
    });
  });
});
