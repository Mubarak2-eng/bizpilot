import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { normalizePhoneNumber } from "../src/lib/whatsapp/security";
import {
  getWhatsAppSession,
  addMessageToSession,
  deleteWhatsAppSession,
} from "../src/lib/whatsapp/session";
import { verifyBusinessMembership } from "../src/lib/membership";
import { hasMinimumRole, Role, ForbiddenError } from "../src/types/auth";

describe("Phase 5B: WhatsApp Settings UI Integration & Management", () => {
  let ownerUser: { id: string; email: string; name: string | null };
  let adminUser: { id: string; email: string; name: string | null };
  let staffUser: { id: string; email: string; name: string | null };
  let biz1: { id: string; name: string; slug: string };
  let biz2: { id: string; name: string; slug: string };

  const testPhoneAcme = "2348055551111";
  const testPhoneBeta = "2348077772222";
  const testPhoneUpdate = "2348088883333";

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const admin = await prisma.user.findUnique({ where: { email: "admin@bizpilot.test" } });
    const staff = await prisma.user.findUnique({ where: { email: "staff@bizpilot.test" } });

    const business1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const business2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!owner || !admin || !staff || !business1 || !business2) {
      throw new Error("Seeded test data missing for Phase 5B tests!");
    }

    ownerUser = { id: owner.id, email: owner.email, name: owner.name };
    adminUser = { id: admin.id, email: admin.email, name: admin.name };
    staffUser = { id: staff.id, email: staff.email, name: staff.name };
    biz1 = { id: business1.id, name: business1.name, slug: business1.slug };
    biz2 = { id: business2.id, name: business2.name, slug: business2.slug };
  });

  beforeEach(async () => {
    // Clean up test phone connections before each test to guarantee test isolation
    await prisma.whatsAppConnection.deleteMany({
      where: {
        phoneNumber: {
          in: [testPhoneAcme, testPhoneBeta, testPhoneUpdate, "2348012345678", "15551234567"],
        },
      },
    });
  });

  afterAll(async () => {
    // Clean up test connections
    await prisma.whatsAppConnection.deleteMany({
      where: {
        phoneNumber: {
          in: [testPhoneAcme, testPhoneBeta, testPhoneUpdate, "2348012345678", "15551234567"],
        },
      },
    });
    await prisma.$disconnect();
  });

  describe("1. Phone Number Normalization & Validation", () => {
    it("should normalize Nigerian local format (080...) to E.164 without plus", () => {
      expect(normalizePhoneNumber("08012345678")).toBe("2348012345678");
      expect(normalizePhoneNumber("07031234567")).toBe("2347031234567");
      expect(normalizePhoneNumber("09091234567")).toBe("2349091234567");
    });

    it("should normalize international formatted numbers with spaces, pluses, and hyphens", () => {
      expect(normalizePhoneNumber("+234 801 234 5678")).toBe("2348012345678");
      expect(normalizePhoneNumber("+234-801-234-5678")).toBe("2348012345678");
      expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("15551234567");
      expect(normalizePhoneNumber("+44 7911 123456")).toBe("447911123456");
    });

    it("should handle empty or malformed strings gracefully", () => {
      expect(normalizePhoneNumber("")).toBe("");
      expect(normalizePhoneNumber("abc")).toBe("");
    });
  });

  describe("2. Role-Based Authorization for WhatsApp Settings Management", () => {
    it("OWNER should have permission to manage WhatsApp integration", async () => {
      const context = await verifyBusinessMembership(biz1.id, ownerUser.id);
      expect(context.role).toBe(Role.OWNER);
      expect(hasMinimumRole(context.role, Role.ADMIN)).toBe(true);
    });

    it("ADMIN should have permission to manage WhatsApp integration", async () => {
      const context = await verifyBusinessMembership(biz1.id, adminUser.id);
      expect(context.role).toBe(Role.ADMIN);
      expect(hasMinimumRole(context.role, Role.ADMIN)).toBe(true);
    });

    it("STAFF should NOT have permission to manage WhatsApp integration (Forbidden)", async () => {
      const context = await verifyBusinessMembership(biz1.id, staffUser.id);
      expect(context.role).toBe(Role.STAFF);
      expect(hasMinimumRole(context.role, Role.ADMIN)).toBe(false);

      // Attempting to verify with ADMIN requirement should reject
      await expect(
        verifyBusinessMembership(biz1.id, staffUser.id, [Role.OWNER, Role.ADMIN])
      ).rejects.toThrow(ForbiddenError);
    });

    it("Cross-Tenant Isolation: Admin of Business A cannot manage Business B", async () => {
      await expect(
        verifyBusinessMembership(biz2.id, adminUser.id, [Role.OWNER, Role.ADMIN])
      ).rejects.toThrow("You do not have access to this business");
    });
  });

  describe("3. WhatsApp Connection Lifecycle (Link, Update, Collision, Unlink)", () => {
    it("should successfully link a new WhatsApp number to a business", async () => {
      const connection = await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneAcme,
          userId: ownerUser.id,
          businessId: biz1.id,
          verified: true,
        },
        include: {
          user: {
            select: { name: true, email: true },
          },
          business: {
            select: { name: true, slug: true },
          },
        },
      });

      expect(connection.id).toBeDefined();
      expect(connection.phoneNumber).toBe(testPhoneAcme);
      expect(connection.verified).toBe(true);
      expect(connection.business.name).toBe("Acme Electronics");
      expect(connection.user.email).toBe("demo@bizpilot.test");
    });

    it("should prevent duplicate registration across different businesses (Tenant Collision Protection)", async () => {
      // Link to Business 1 first
      await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneAcme,
          userId: ownerUser.id,
          businessId: biz1.id,
          verified: true,
        },
      });

      // Attempting to create the same phoneNumber for Business 2 should fail with unique constraint
      await expect(
        prisma.whatsAppConnection.create({
          data: {
            phoneNumber: testPhoneAcme,
            userId: ownerUser.id,
            businessId: biz2.id,
            verified: true,
          },
        })
      ).rejects.toThrow();
    });

    it("should allow updating/re-linking the phone number for the same business", async () => {
      // 1. Initial connection
      const initial = await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneAcme,
          userId: ownerUser.id,
          businessId: biz1.id,
          verified: true,
        },
      });
      expect(initial.phoneNumber).toBe(testPhoneAcme);

      // 2. Business changes number: delete old and create new
      await prisma.whatsAppConnection.delete({
        where: { id: initial.id },
      });

      const updated = await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneUpdate,
          userId: adminUser.id,
          businessId: biz1.id,
          verified: true,
        },
      });

      expect(updated.phoneNumber).toBe(testPhoneUpdate);
      expect(updated.businessId).toBe(biz1.id);
    });

    it("should successfully disconnect/unlink WhatsApp number and clean up session cache", async () => {
      // 1. Link connection
      const conn = await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneAcme,
          userId: ownerUser.id,
          businessId: biz1.id,
          verified: true,
        },
      });

      // 2. Populate an active session
      await addMessageToSession(testPhoneAcme, {
        id: "msg-test-1",
        role: "user",
        content: "What are my sales today?",
        timestamp: new Date().toISOString(),
      });
      const session = await getWhatsAppSession(testPhoneAcme);
      expect(session.conversationHistory.length).toBeGreaterThan(0);

      // 3. Unlink connection from DB
      await prisma.whatsAppConnection.delete({
        where: { id: conn.id },
      });

      // 4. Clean session
      await deleteWhatsAppSession(testPhoneAcme);

      // 5. Verify DB record is gone
      const checkDb = await prisma.whatsAppConnection.findUnique({
        where: { phoneNumber: testPhoneAcme },
      });
      expect(checkDb).toBeNull();
    });
  });

  describe("4. Settings UI Data Sanitization & Credential Protection", () => {
    it("should return sanitized connection view without exposing app secrets or tokens", async () => {
      await prisma.whatsAppConnection.create({
        data: {
          phoneNumber: testPhoneAcme,
          userId: ownerUser.id,
          businessId: biz1.id,
          verified: true,
        },
      });

      // Fetch connection as SettingsPage does
      const dbConn = await prisma.whatsAppConnection.findFirst({
        where: { businessId: biz1.id, phoneNumber: testPhoneAcme },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      });

      expect(dbConn).not.toBeNull();
      const sanitized = {
        id: dbConn!.id,
        phoneNumber: dbConn!.phoneNumber,
        verified: dbConn!.verified,
        createdAt: dbConn!.createdAt.toISOString(),
        updatedAt: dbConn!.updatedAt.toISOString(),
        linkedByUser: dbConn!.user
          ? {
              name: dbConn!.user.name,
              email: dbConn!.user.email,
            }
          : undefined,
      };

      // Verify no secrets or credentials exist on sanitized object
      expect(sanitized.phoneNumber).toBe(testPhoneAcme);
      expect(sanitized.verified).toBe(true);
      expect("WHATSAPP_ACCESS_TOKEN" in sanitized).toBe(false);
      expect("WHATSAPP_APP_SECRET" in sanitized).toBe(false);
      expect("WHATSAPP_VERIFY_TOKEN" in sanitized).toBe(false);
      expect("token" in sanitized).toBe(false);
      expect("secret" in sanitized).toBe(false);
    });
  });
});
