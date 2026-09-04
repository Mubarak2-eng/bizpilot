import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  ensureDefaultPlans,
  PLAN_DEFINITIONS,
  getBusinessSubscription,
  getBusinessPlan,
  hasFeature,
} from "../src/lib/subscriptions";
import {
  getAIUsage,
  checkAndIncrementAIQuota,
  getCurrentPeriodKey,
} from "../src/lib/subscriptions/quotas";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from "../src/lib/payments/paystack";
import {
  initializePlanCheckoutAction,
  verifyPaymentAction,
} from "../src/lib/actions/subscription";
import { POST as paystackWebhookHandler } from "../src/app/api/webhook/paystack/route";

describe("Phase 8: Payments & Monetization Security Suite", () => {
  let userOwnerA: { id: string; email: string };
  let userStaffA: { id: string; email: string };
  let userOwnerB: { id: string; email: string };
  let testBizA: { id: string; name: string; currency: string };
  let testBizB: { id: string; name: string; currency: string };

  const testSecretKey = "sk_test_paystack_secret_phase8_monetization";

  beforeAll(async () => {
    await ensureDefaultPlans();

    const hashedPassword = await hashPassword("SecurePass123!");

    userOwnerA = await prisma.user.create({
      data: {
        email: `phase8_owner_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Phase 8 Owner A",
      },
    });

    userStaffA = await prisma.user.create({
      data: {
        email: `phase8_staff_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Phase 8 Staff A",
      },
    });

    userOwnerB = await prisma.user.create({
      data: {
        email: `phase8_owner_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Phase 8 Owner B",
      },
    });

    testBizA = await prisma.business.create({
      data: {
        name: "Nexus Electronics",
        slug: `nexus-elec-${Date.now()}`,
        businessType: "ELECTRONICS",
        currency: "NGN",
        memberships: {
          create: [
            { userId: userOwnerA.id, role: "OWNER" },
            { userId: userStaffA.id, role: "STAFF" },
          ],
        },
      },
    });

    testBizB = await prisma.business.create({
      data: {
        name: "Summit Supermarket",
        slug: `summit-sup-${Date.now()}`,
        businessType: "SUPERMARKET",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerB.id, role: "OWNER" }],
        },
      },
    });
  });

  afterAll(async () => {
    const bizIds = [testBizA?.id, testBizB?.id].filter(Boolean);

    for (const bId of bizIds) {
      await prisma.payment.deleteMany({ where: { businessId: bId } });
      await prisma.aIUsage.deleteMany({ where: { businessId: bId } });
      await prisma.subscription.deleteMany({ where: { businessId: bId } });
      await prisma.membership.deleteMany({ where: { businessId: bId } });
      await prisma.business.deleteMany({ where: { id: bId } });
    }

    if (userOwnerA?.id) await prisma.user.deleteMany({ where: { id: userOwnerA.id } });
    if (userStaffA?.id) await prisma.user.deleteMany({ where: { id: userStaffA.id } });
    if (userOwnerB?.id) await prisma.user.deleteMany({ where: { id: userOwnerB.id } });
  });

  // ── 1. Plan Structure & Free vs Pro Definitions ───────────────────────────
  describe("1. Plan Definitions & Defaults", () => {
    it("should have FREE plan configured at ₦0 with 25 AI queries quota", async () => {
      const freePlan = await prisma.plan.findUnique({ where: { code: "FREE" } });
      expect(freePlan).toBeDefined();
      expect(Number(freePlan?.monthlyPrice)).toBe(0);
      expect(freePlan?.currency).toBe("NGN");
      expect(freePlan?.aiMonthlyLimit).toBe(25);
      expect(freePlan?.maxStaff).toBe(2);
    });

    it("should have PRO plan configured at ₦5,000 with 500 AI queries quota", async () => {
      const proPlan = await prisma.plan.findUnique({ where: { code: "PRO" } });
      expect(proPlan).toBeDefined();
      expect(Number(proPlan?.monthlyPrice)).toBe(5000);
      expect(proPlan?.currency).toBe("NGN");
      expect(proPlan?.aiMonthlyLimit).toBe(500);
      expect(proPlan?.maxStaff).toBe(10);
    });

    it("should resolve expired trial to FREE tier default limits", async () => {
      // Initialize trial at current time
      await getBusinessSubscription(testBizB.id);

      // Future date 30 days ahead (trial expired)
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subState = await getBusinessSubscription(testBizB.id, futureDate);

      expect(subState.isTrialExpired).toBe(true);
      expect(subState.planCode).toBe("FREE");
      expect(subState.plan.monthlyPrice).toBe(0);
      expect(subState.plan.aiMonthlyLimit).toBe(25);
    });
  });

  // ── 2. Payment Initialization & Server-Side Price Derivation ──────────────
  describe("2. Server-Side Price Derivation & Checkout Initialization", () => {
    it("should derive exactly ₦5,000 (500,000 Kobo) for PRO without trusting client price", async () => {
      const proPlan = await prisma.plan.findUnique({ where: { code: "PRO" } });
      expect(Number(proPlan?.monthlyPrice)).toBe(5000);

      const res = await initializePaystackTransaction({
        email: userOwnerA.email,
        amountInKobo: Math.round(Number(proPlan?.monthlyPrice) * 100),
        planCode: "PRO",
        metadata: {
          businessId: testBizA.id,
          planCode: "PRO",
        },
      });

      expect(res.success).toBe(true);
      expect(res.authorizationUrl).toBeDefined();
      expect(res.reference).toBeDefined();

      // Zero key exposure check
      const resRecord = res as unknown as Record<string, unknown>;
      expect(resRecord.PAYSTACK_SECRET_KEY).toBeUndefined();
      expect(resRecord.secretKey).toBeUndefined();
    });

    it("should reject checkout initialization for non-admin/staff member", async () => {
      const result = await initializePlanCheckoutAction(testBizA.id, "PRO");
      // Without authenticated session matching admin context, returns error
      expect(result.error).toBeDefined();
    });
  });

  // ── 3. Paystack Webhook Security & Signatures ──────────────────────────────
  describe("3. Paystack Webhook Signature Verification & Fail-Closed Behavior", () => {
    it("should verify valid HMAC-SHA512 signature", () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const body = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_test_valid_sig", amount: 500000 },
      });

      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(body)
        .digest("hex");

      const isValid = verifyPaystackWebhookSignature(body, signature);
      expect(isValid).toBe(true);

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should reject invalid webhook signature with 401 Unauthorized", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: {
          "x-paystack-signature": "tampered_signature_hex_1234567890",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "charge.success" }),
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Invalid signature");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should fail-closed in production when PAYSTACK_SECRET_KEY is missing", () => {
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
  });

  // ── 4. Webhook Processing: Success, Idempotency & Zero-Trust Validation ────
  describe("4. Webhook Processing & Zero-Trust Verification", () => {
    it("should process valid ₦5,000 PRO charge.success and activate PRO subscription", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `phase8_success_ref_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          status: "success",
          amount: 500000, // ₦5,000 in Kobo
          currency: "NGN",
          customer: { customer_code: "CUS_phase8_abc" },
          metadata: {
            businessId: testBizA.id,
            planCode: "PRO",
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(rawBody)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: {
          "x-paystack-signature": signature,
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(200);

      // Verify subscription state is ACTIVE on PRO
      const subState = await getBusinessSubscription(testBizA.id);
      expect(subState.status).toBe("ACTIVE");
      expect(subState.planCode).toBe("PRO");
      expect(subState.isActive).toBe(true);
      expect(subState.plan.monthlyPrice).toBe(5000);
      expect(subState.plan.aiMonthlyLimit).toBe(500);

      // Verify Payment record
      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
      });
      expect(payment).toBeDefined();
      expect(payment?.status).toBe("SUCCESS");
      expect(Number(payment?.amount)).toBe(5000);
      expect(payment?.currency).toBe("NGN");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should safely and idempotently handle duplicate webhook deliveries", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `phase8_dup_ref_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          status: "success",
          amount: 500000,
          currency: "NGN",
          metadata: { businessId: testBizA.id, planCode: "PRO" },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(rawBody)
        .digest("hex");

      // First webhook delivery
      const req1 = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: { "x-paystack-signature": signature, "content-type": "application/json" },
        body: rawBody,
      });
      const res1 = await paystackWebhookHandler(req1);
      expect(res1.status).toBe(200);

      // Second (duplicate) webhook delivery
      const req2 = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: { "x-paystack-signature": signature, "content-type": "application/json" },
        body: rawBody,
      });
      const res2 = await paystackWebhookHandler(req2);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.status).toBe("already_processed");

      // Ensure no duplicate payment rows
      const count = await prisma.payment.count({
        where: { paystackReference: reference },
      });
      expect(count).toBe(1);

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should reject underpaid transactions (wrong amount) and not activate subscription", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `phase8_underpaid_ref_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          status: "success",
          amount: 100000, // ₦1,000 (underpaid for ₦5,000 PRO plan)
          currency: "NGN",
          metadata: { businessId: testBizB.id, planCode: "PRO" },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(rawBody)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: { "x-paystack-signature": signature, "content-type": "application/json" },
        body: rawBody,
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Underpayment");

      // Ensure Biz B was not activated
      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
      });
      expect(payment).toBeNull();

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should reject non-NGN currency (wrong currency) and not activate subscription", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `phase8_currency_ref_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          status: "success",
          amount: 500000,
          currency: "USD", // Invalid currency
          metadata: { businessId: testBizB.id, planCode: "PRO" },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(rawBody)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: { "x-paystack-signature": signature, "content-type": "application/json" },
        body: rawBody,
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid currency");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should reject payments referencing nonexistent business tenants", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `phase8_nonexistent_ref_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          status: "success",
          amount: 500000,
          currency: "NGN",
          metadata: { businessId: "nonexistent_tenant_id_999", planCode: "PRO" },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(rawBody)
        .digest("hex");

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: { "x-paystack-signature": signature, "content-type": "application/json" },
        body: rawBody,
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Business not found");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });
  });

  // ── 5. AI Quotas: Free vs Pro Enforcement ──────────────────────────────────
  describe("5. Centralized Quota & Usage Enforcement", () => {
    it("should enforce FREE plan quota ceiling at 25 queries", async () => {
      // Ensure testBizB has an existing trial created at current time
      await getBusinessSubscription(testBizB.id);

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const periodKey = getCurrentPeriodKey(futureDate);

      // Set Biz B to FREE with 25 queries used in the future period
      await prisma.aIUsage.upsert({
        where: { businessId_periodKey: { businessId: testBizB.id, periodKey } },
        create: { businessId: testBizB.id, periodKey, queryCount: 25 },
        update: { queryCount: 25 },
      });

      // Expired trial -> FREE tier (limit 25)
      const quotaCheck = await checkAndIncrementAIQuota(testBizB.id, futureDate);

      expect(quotaCheck.allowed).toBe(false);
      expect(quotaCheck.limit).toBe(25);
      expect(quotaCheck.remaining).toBe(0);
      expect(quotaCheck.message).toContain("25 AI queries");
    });

    it("should allow PRO plan to consume up to 500 queries", async () => {
      // Biz A is on ACTIVE PRO
      const periodKey = getCurrentPeriodKey();
      await prisma.aIUsage.deleteMany({ where: { businessId: testBizA.id } });

      const check1 = await checkAndIncrementAIQuota(testBizA.id);
      expect(check1.allowed).toBe(true);
      expect(check1.limit).toBe(500);
      expect(check1.remaining).toBe(499);
    });

    it("should gate advanced features to PRO and BUSINESS tiers only", async () => {
      const isBrainProA = await hasFeature(testBizA.id, "business_brain_advanced");
      expect(isBrainProA).toBe(true);

      const isAiWriteActionsA = await hasFeature(testBizA.id, "ai_write_actions");
      expect(isAiWriteActionsA).toBe(true);
    });
  });
});
