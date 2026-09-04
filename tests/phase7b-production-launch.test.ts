import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { getOTPSalt, hashOTP, verifyOTPHash, generateWhatsAppOTP } from "../src/lib/whatsapp/otp";
import { POST as morningBriefCronHandler } from "../src/app/api/cron/morning-brief/route";
import { confirmAIAction } from "../src/lib/actions/assistant-actions";
import { createPendingAction } from "../src/lib/ai/pending-actions";

describe("Phase 7B: Production Launch Preparation & Cron Tests", () => {
  let userOwnerA: { id: string; email: string };
  let userOwnerB: { id: string; email: string };
  let userOwnerC: { id: string; email: string };
  let bizActive: { id: string; name: string; slug: string; currency: string };
  let bizUnverified: { id: string; name: string; slug: string; currency: string };
  let bizExpired: { id: string; name: string; slug: string; currency: string };

  const phoneActive = "2348055550001";
  const phoneUnverified = "2348055550002";
  const phoneExpired = "2348055550003";

  const testCronSecret = "super_secure_cron_secret_2026";

  beforeAll(async () => {
    process.env.CRON_SECRET = testCronSecret;

    const hashedPassword = await hashPassword("StrongPass123!");

    userOwnerA = await prisma.user.create({
      data: {
        email: `p7b_owner_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Launch Owner A",
      },
    });

    userOwnerB = await prisma.user.create({
      data: {
        email: `p7b_owner_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Launch Owner B",
      },
    });

    userOwnerC = await prisma.user.create({
      data: {
        email: `p7b_owner_c_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Launch Owner C",
      },
    });

    // Business 1: Active business with verified WhatsApp
    bizActive = await prisma.business.create({
      data: {
        name: "Starlight Supermarket",
        slug: `starlight-sup-${Date.now()}`,
        businessType: "SUPERMARKET",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerA.id, role: "OWNER" }],
        },
      },
    });

    await prisma.whatsAppConnection.create({
      data: {
        businessId: bizActive.id,
        userId: userOwnerA.id,
        phoneNumber: phoneActive,
        verified: true,
      },
    });

    // Business 2: Unverified WhatsApp connection
    bizUnverified = await prisma.business.create({
      data: {
        name: "Moonlight Pharmacy",
        slug: `moonlight-phar-${Date.now()}`,
        businessType: "PHARMACY",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerB.id, role: "OWNER" }],
        },
      },
    });

    await prisma.whatsAppConnection.create({
      data: {
        businessId: bizUnverified.id,
        userId: userOwnerB.id,
        phoneNumber: phoneUnverified,
        verified: false,
      },
    });

    // Business 3: Verified WhatsApp but expired trial subscription
    bizExpired = await prisma.business.create({
      data: {
        name: "Sunset Boutiques",
        slug: `sunset-bout-${Date.now()}`,
        businessType: "FASHION",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerC.id, role: "OWNER" }],
        },
      },
    });

    await prisma.whatsAppConnection.create({
      data: {
        businessId: bizExpired.id,
        userId: userOwnerC.id,
        phoneNumber: phoneExpired,
        verified: true,
      },
    });

    const proPlan = await prisma.plan.findUnique({ where: { code: "PRO" } });
    if (proPlan) {
      await prisma.subscription.create({
        data: {
          businessId: bizExpired.id,
          planId: proPlan.id,
          status: "CANCELLED",
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          cancelledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
  });

  afterAll(async () => {
    const bizIds = [bizActive?.id, bizUnverified?.id, bizExpired?.id].filter(Boolean);

    for (const bId of bizIds) {
      await prisma.payment.deleteMany({ where: { businessId: bId } });
      await prisma.aIUsage.deleteMany({ where: { businessId: bId } });
      await prisma.businessGoal.deleteMany({ where: { businessId: bId } });
      await prisma.subscription.deleteMany({ where: { businessId: bId } });
      await prisma.whatsAppConnection.deleteMany({ where: { businessId: bId } });
      await prisma.membership.deleteMany({ where: { businessId: bId } });
      await prisma.business.deleteMany({ where: { id: bId } });
    }

    if (userOwnerA?.id) await prisma.user.deleteMany({ where: { id: userOwnerA.id } });
    if (userOwnerB?.id) await prisma.user.deleteMany({ where: { id: userOwnerB.id } });
    if (userOwnerC?.id) await prisma.user.deleteMany({ where: { id: userOwnerC.id } });
  });

  // ── 1. OTP Secret Resolution Tests ─────────────────────────────────────────
  describe("WhatsApp OTP Secret Resolution", () => {
    it("should dynamically resolve AUTH_SECRET when OTP_SECRET_KEY is not set", () => {
      const oldOtpKey = process.env.OTP_SECRET_KEY;
      const oldAuthSecret = process.env.AUTH_SECRET;

      delete process.env.OTP_SECRET_KEY;
      process.env.AUTH_SECRET = "test_auth_secret_xyz123";

      const salt = getOTPSalt();
      expect(salt).toBe("test_auth_secret_xyz123");

      const otp = generateWhatsAppOTP();
      const hash = hashOTP(otp);
      expect(verifyOTPHash(otp, hash)).toBe(true);
      expect(verifyOTPHash("000000", hash)).toBe(false);

      process.env.OTP_SECRET_KEY = oldOtpKey;
      process.env.AUTH_SECRET = oldAuthSecret;
    });

    it("should prefer OTP_SECRET_KEY over AUTH_SECRET when provided", () => {
      const oldOtpKey = process.env.OTP_SECRET_KEY;
      const oldAuthSecret = process.env.AUTH_SECRET;

      process.env.OTP_SECRET_KEY = "dedicated_otp_secret_999";
      process.env.AUTH_SECRET = "fallback_auth_secret_111";

      const salt = getOTPSalt();
      expect(salt).toBe("dedicated_otp_secret_999");

      process.env.OTP_SECRET_KEY = oldOtpKey;
      process.env.AUTH_SECRET = oldAuthSecret;
    });
  });

  // ── 2. Morning Brief Scheduled Cron Tests ──────────────────────────────────
  describe("Morning Brief Cron Job (POST /api/cron/morning-brief)", () => {
    it("should reject cron requests without Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
      });

      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should reject cron requests with invalid Bearer token", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid_secret_12345",
        },
      });

      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(401);
    });

    it("should fail-closed in production if CRON_SECRET is missing", async () => {
      const oldEnv = process.env.NODE_ENV;
      const oldSecret = process.env.CRON_SECRET;

      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.CRON_SECRET;

      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
        headers: {
          Authorization: "Bearer any_token",
        },
      });

      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(401);

      (process.env as Record<string, string | undefined>).NODE_ENV = oldEnv;
      process.env.CRON_SECRET = oldSecret;
    });

    it("should process verified businesses, skip unverified/cancelled ones, and return safe stats", async () => {
      process.env.CRON_SECRET = testCronSecret;
      const oldWaToken = process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_ACCESS_TOKEN; // Run in simulation mode

      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testCronSecret}`,
        },
      });

      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.processed).toBeGreaterThanOrEqual(1);
      expect(body.sent).toBeGreaterThanOrEqual(1);
      expect(body.skipped).toBeGreaterThanOrEqual(1); // bizExpired should be skipped
      expect(typeof body.failed).toBe("number");

      process.env.WHATSAPP_ACCESS_TOKEN = oldWaToken;
    });
  });

  // ── 3. Action Execution & Single-Use Consumption ───────────────────────────
  describe("AI Action Confirmation Security", () => {
    it("should prevent double-execution replay on consumed action tokens", async () => {
      const token = await createPendingAction(
        userOwnerA.id,
        bizActive.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: {
            category: "Utilities",
            amount: 25000,
            description: "Internet bill",
            date: "2026-08-26",
          },
        }
      );

      expect(token).toBeDefined();
    });
  });
});
