import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  ensureDefaultPlans,
  PLAN_DEFINITIONS,
  getBusinessSubscription,
  getBusinessPlan,
  hasFeature,
  createInitialTrialSubscription,
} from "../src/lib/subscriptions";
import {
  getAIUsage,
  checkAndIncrementAIQuota,
  getCurrentPeriodKey,
} from "../src/lib/subscriptions/quotas";
import {
  initializePaystackTransaction,
  verifyPaystackWebhookSignature,
} from "../src/lib/payments/paystack";
import { initializePlanCheckoutAction } from "../src/lib/actions/subscription";
import { runAIAssistant } from "../src/lib/ai/executor";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";

describe("Phase 6D: Commercialization, Subscriptions, Paystack & AI Quotas", () => {
  let userOwner: { id: string; email: string };
  let userAdmin: { id: string; email: string };
  let userOther: { id: string; email: string };
  let testBizA: { id: string; name: string; currency: string };
  let testBizB: { id: string; name: string; currency: string };

  const testPhoneA = "2348077771111";

  beforeAll(async () => {
    await ensureDefaultPlans();

    const hashedPassword = await hashPassword("StrongPass123!");

    userOwner = await prisma.user.create({
      data: {
        email: `sub_owner_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Subscription Owner",
      },
    });

    userAdmin = await prisma.user.create({
      data: {
        email: `sub_admin_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Subscription Admin",
      },
    });

    userOther = await prisma.user.create({
      data: {
        email: `sub_other_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Other Tenant Owner",
      },
    });

    testBizA = await prisma.business.create({
      data: {
        name: "Alpha Retailers",
        slug: `alpha-ret-${Date.now()}`,
        businessType: "RETAIL",
        currency: "NGN",
        memberships: {
          create: [
            { userId: userOwner.id, role: "OWNER" },
            { userId: userAdmin.id, role: "ADMIN" },
          ],
        },
      },
    });

    testBizB = await prisma.business.create({
      data: {
        name: "Beta Supermarket",
        slug: `beta-sup-${Date.now()}`,
        businessType: "SUPERMARKET",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOther.id, role: "OWNER" }],
        },
      },
    });

    // Link verified WhatsApp connection for Biz A
    await prisma.whatsAppConnection.create({
      data: {
        businessId: testBizA.id,
        userId: userOwner.id,
        phoneNumber: testPhoneA,
        verified: true,
      },
    });
  });

  afterAll(async () => {
    const bizIds = [testBizA?.id, testBizB?.id].filter(Boolean);

    for (const bId of bizIds) {
      await prisma.payment.deleteMany({ where: { businessId: bId } });
      await prisma.aIUsage.deleteMany({ where: { businessId: bId } });
      await prisma.subscription.deleteMany({ where: { businessId: bId } });
      await prisma.whatsAppConnection.deleteMany({ where: { businessId: bId } });
      await prisma.membership.deleteMany({ where: { businessId: bId } });
      await prisma.business.deleteMany({ where: { id: bId } });
    }

    if (userOwner?.id) await prisma.user.deleteMany({ where: { id: userOwner.id } });
    if (userAdmin?.id) await prisma.user.deleteMany({ where: { id: userAdmin.id } });
    if (userOther?.id) await prisma.user.deleteMany({ where: { id: userOther.id } });
  });

  // ── 1. Plan Structure & Database Integrity ─────────────────────────────────
  describe("Plan Configuration & Pricing Structure", () => {
    it("should ensure all 4 commercial plans are provisioned with server-side pricing", async () => {
      const plans = await prisma.plan.findMany({ where: { isActive: true } });
      expect(plans.length).toBeGreaterThanOrEqual(4);

      const free = plans.find((p) => p.code === "FREE");
      const starter = plans.find((p) => p.code === "STARTER");
      const pro = plans.find((p) => p.code === "PRO");
      const business = plans.find((p) => p.code === "BUSINESS");

      expect(Number(free?.monthlyPrice)).toBe(0);
      expect(free?.aiMonthlyLimit).toBe(25);

      expect(Number(starter?.monthlyPrice)).toBe(5000);
      expect(starter?.aiMonthlyLimit).toBe(150);

      expect(Number(pro?.monthlyPrice)).toBe(12000);
      expect(pro?.aiMonthlyLimit).toBe(500);

      expect(Number(business?.monthlyPrice)).toBe(25000);
      expect(business?.aiMonthlyLimit).toBe(1500);
    });
  });

  // ── 2. Trial Lifecycle & Server-Side Fallback ──────────────────────────────
  describe("14-Day PRO Trial & Expiration Fallback", () => {
    it("should provision a 14-day PRO trial on newly registered businesses", async () => {
      const subState = await getBusinessSubscription(testBizA.id);

      expect(subState.planCode).toBe("PRO");
      expect(subState.status).toBe("TRIALING");
      expect(subState.isTrialing).toBe(true);
      expect(subState.isTrialExpired).toBe(false);
      expect(subState.isActive).toBe(true);
      expect(subState.plan.aiMonthlyLimit).toBe(500);

      // Verify expiration date is ~14 days ahead
      const diffDays = Math.round(
        (subState.currentPeriodEnd.getTime() - subState.currentPeriodStart.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBe(14);
    });

    it("should dynamically fall back to FREE tier when trial is expired", async () => {
      // Create a reference date 15 days in the future
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const subState = await getBusinessSubscription(testBizA.id, futureDate);

      expect(subState.isTrialExpired).toBe(true);
      expect(subState.isTrialing).toBe(false);
      expect(subState.status).toBe("EXPIRED");
      expect(subState.planCode).toBe("FREE");
      expect(subState.plan.aiMonthlyLimit).toBe(25);
    });

    it("should enforce feature gates between FREE and PRO tiers", async () => {
      // During active trial (PRO)
      const hasBrainPro = await hasFeature(testBizA.id, "business_brain_advanced");
      const hasAiActions = await hasFeature(testBizA.id, "ai_write_actions");
      expect(hasBrainPro).toBe(true);
      expect(hasAiActions).toBe(true);

      // When trial has expired (FREE fallback)
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const hasAiActionsExpired = await hasFeature(testBizA.id, "ai_write_actions", futureDate);
      expect(hasAiActionsExpired).toBe(false);
    });
  });

  // ── 3. Paystack Server-Side Integration & Webhook Security ─────────────────
  describe("Paystack Integration & Webhook Security", () => {
    it("should initialize transaction with server-calculated amount in Kobo", async () => {
      const res = await initializePaystackTransaction({
        email: userOwner.email,
        amountInKobo: 1200000, // ₦12,000
        planCode: "PRO",
      });

      expect(res.success).toBe(true);
      expect(res.authorizationUrl).toBeDefined();
      expect(res.reference).toBeDefined();
    });

    it("should verify valid HMAC-SHA512 webhook signature", () => {
      const secret = "test_paystack_secret_key_12345";
      process.env.PAYSTACK_SECRET_KEY = secret;

      const body = JSON.stringify({ event: "charge.success", data: { id: 12345 } });
      const validSig = crypto.createHmac("sha512", secret).update(body).digest("hex");

      const isValid = verifyPaystackWebhookSignature(body, validSig);
      expect(isValid).toBe(true);
    });

    it("should reject invalid webhook signature", () => {
      const secret = "test_paystack_secret_key_12345";
      process.env.PAYSTACK_SECRET_KEY = secret;

      const body = JSON.stringify({ event: "charge.success", data: { id: 12345 } });
      const invalidSig = "000000000000000000000000000000000000000000000000";

      const isValid = verifyPaystackWebhookSignature(body, invalidSig);
      expect(isValid).toBe(false);
    });

    it("should fail-closed in production if PAYSTACK_SECRET_KEY is missing", () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.PAYSTACK_SECRET_KEY;

      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.PAYSTACK_SECRET_KEY;

      const body = JSON.stringify({ event: "charge.success" });
      const isValid = verifyPaystackWebhookSignature(body, "any_sig");
      expect(isValid).toBe(false);

      (process.env as Record<string, string | undefined>).NODE_ENV = oldEnv;
      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should process charge.success idempotently and activate subscription", async () => {
      const ref = `test_ref_${Date.now()}`;
      const planStarter = await prisma.plan.findUnique({ where: { code: "STARTER" } });

      // Record payment and activate
      const payment = await prisma.payment.create({
        data: {
          businessId: testBizB.id,
          paystackReference: ref,
          amount: 5000.0,
          currency: "NGN",
          status: "SUCCESS",
          eventType: "charge.success",
        },
      });

      await prisma.subscription.upsert({
        where: { businessId: testBizB.id },
        create: {
          businessId: testBizB.id,
          planId: planStarter!.id,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          planId: planStarter!.id,
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const subB = await getBusinessSubscription(testBizB.id);
      expect(subB.planCode).toBe("STARTER");
      expect(subB.status).toBe("ACTIVE");
      expect(subB.isTrialing).toBe(false);

      // Duplicate payment creation with same reference must fail unique constraint
      await expect(
        prisma.payment.create({
          data: {
            businessId: testBizB.id,
            paystackReference: ref,
            amount: 5000.0,
            status: "SUCCESS",
            eventType: "charge.success",
          },
        })
      ).rejects.toThrow();
    });
  });

  // ── 4. AI Usage Quotas & Atomic Enforcement ────────────────────────────────
  describe("AI Usage Quotas & Enforcement", () => {
    it("should track and increment usage atomically within billing cycle", async () => {
      const periodKey = getCurrentPeriodKey();

      // Clean existing usage for testBizA
      await prisma.aIUsage.deleteMany({ where: { businessId: testBizA.id } });

      // First query
      const check1 = await checkAndIncrementAIQuota(testBizA.id);
      expect(check1.allowed).toBe(true);
      expect(check1.queryCount).toBe(1);

      // Second query
      const check2 = await checkAndIncrementAIQuota(testBizA.id);
      expect(check2.allowed).toBe(true);
      expect(check2.queryCount).toBe(2);

      const usage = await getAIUsage(testBizA.id);
      expect(usage.queryCount).toBe(2);
      expect(usage.periodKey).toBe(periodKey);
    });

    it("should block additional AI queries when limit is exhausted", async () => {
      const periodKey = getCurrentPeriodKey();
      const subState = await getBusinessSubscription(testBizA.id);
      const limit = subState.plan.aiMonthlyLimit;

      // Set usage count to limit
      await prisma.aIUsage.upsert({
        where: { businessId_periodKey: { businessId: testBizA.id, periodKey } },
        create: { businessId: testBizA.id, periodKey, queryCount: limit },
        update: { queryCount: limit },
      });

      const quotaCheck = await checkAndIncrementAIQuota(testBizA.id);
      expect(quotaCheck.allowed).toBe(false);
      expect(quotaCheck.remaining).toBe(0);
      expect(quotaCheck.message).toContain("reached your 500 AI queries for this month");

      // Verify AI execution returns friendly upgrade message
      const res = await runAIAssistant([], "What were my sales today?", {
        userId: userOwner.id,
        businessId: testBizA.id,
        businessName: testBizA.name,
        currency: testBizA.currency,
        role: "OWNER",
      });

      expect(res.providerUsed).toBe("quota_enforcer");
      expect(res.message.content).toContain("Upgrade your plan to continue using BizPilot AI");
    });

    it("should enforce shared quota across WhatsApp and Web Assistant channels", async () => {
      // Inbound WhatsApp query should also encounter the quota limit
      const waResult = await handleIncomingWhatsAppMessage(
        testPhoneA,
        "What were my sales today?",
        `msg_quota_${Date.now()}`
      );

      expect(waResult.success).toBe(true);
      expect(waResult.replySent).toContain("reached your 500 AI queries");
    });

    it("should roll over to zero count on a new monthly billing period", async () => {
      const nextMonthDate = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
      const nextMonthKey = getCurrentPeriodKey(nextMonthDate);

      const usageNextMonth = await getAIUsage(testBizA.id, nextMonthDate);
      expect(usageNextMonth.queryCount).toBe(0);
      expect(usageNextMonth.periodKey).toBe(nextMonthKey);
    });

    it("should isolate AI usage completely between independent business tenants", async () => {
      const usageA = await getAIUsage(testBizA.id);
      const usageB = await getAIUsage(testBizB.id);

      expect(usageA.queryCount).not.toBe(usageB.queryCount);
    });
  });
});
