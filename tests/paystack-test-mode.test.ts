import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from "../src/lib/payments/paystack";
import { POST as paystackWebhookHandler } from "../src/app/api/webhook/paystack/route";
import { getBusinessSubscription } from "../src/lib/subscriptions/service";
import { ensureDefaultPlans } from "../src/lib/subscriptions/plans";

describe("Paystack Test Mode Verification Suite", () => {
  let userOwner: { id: string; email: string };
  let testBiz: { id: string; name: string; currency: string };

  const testSecretKey = "sk_test_mock_paystack_secret_key_2026";

  beforeAll(async () => {
    await ensureDefaultPlans();

    const hashedPassword = await hashPassword("PaystackTest123!");

    userOwner = await prisma.user.create({
      data: {
        email: `paystack_owner_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Paystack Tester",
      },
    });

    testBiz = await prisma.business.create({
      data: {
        name: "Paystack Test Electronics",
        slug: `paystack-elec-${Date.now()}`,
        businessType: "ELECTRONICS",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwner.id, role: "OWNER" }],
        },
      },
    });
  });

  afterAll(async () => {
    if (testBiz?.id) {
      await prisma.payment.deleteMany({ where: { businessId: testBiz.id } });
      await prisma.subscription.deleteMany({ where: { businessId: testBiz.id } });
      await prisma.membership.deleteMany({ where: { businessId: testBiz.id } });
      await prisma.business.deleteMany({ where: { id: testBiz.id } });
    }

    if (userOwner?.id) {
      await prisma.user.deleteMany({ where: { id: userOwner.id } });
    }
  });

  // ── 1. Environment & Key Isolation ─────────────────────────────────────────
  describe("Environment Configuration & Security", () => {
    it("should never expose secret key in transaction initialization return value", async () => {
      const res = await initializePaystackTransaction({
        email: userOwner.email,
        amountInKobo: 500000,
        planCode: "STARTER",
      });

      expect(res.success).toBe(true);
      const resRecord = res as unknown as Record<string, unknown>;
      expect(resRecord.secretKey).toBeUndefined();
      expect(resRecord.PAYSTACK_SECRET_KEY).toBeUndefined();
    });

    it("should verify HMAC-SHA512 signature using test secret key", () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const payload = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_test_123", amount: 1200000 },
      });

      const signature = crypto
        .createHmac("sha512", testSecretKey)
        .update(payload)
        .digest("hex");

      const isValid = verifyPaystackWebhookSignature(payload, signature);
      expect(isValid).toBe(true);

      const isInvalid = verifyPaystackWebhookSignature(payload, "invalid_sig");
      expect(isInvalid).toBe(false);

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });
  });

  // ── 2. Server-Side Amount Calculation & Paystack API Helpers ───────────────
  describe("Server-Side Amount Calculation & Helper Verification", () => {
    it("should initialize STARTER (₦5,000 / 500,000 Kobo) and return valid authorization URL for redirect", async () => {
      const res = await initializePaystackTransaction({
        email: "demo@bizpilot.test",
        amountInKobo: 500000, // ₦5,000 in Kobo
        callbackUrl: "http://localhost:3000/settings",
        metadata: {
          businessId: testBiz.id,
          planCode: "STARTER",
        },
      });

      expect(res.success).toBe(true);
      expect(res.authorizationUrl).toBeDefined();
      expect(res.authorizationUrl).toContain("paystack.com");
      expect(res.reference).toBeDefined();
    });

    it("should initialize PRO (₦12,000 / 1,200,000 Kobo) and return valid authorization URL for redirect", async () => {
      const res = await initializePaystackTransaction({
        email: "demo@bizpilot.test",
        amountInKobo: 1200000, // ₦12,000 in Kobo
        callbackUrl: "http://localhost:3000/settings",
        metadata: {
          businessId: testBiz.id,
          planCode: "PRO",
        },
      });

      expect(res.success).toBe(true);
      expect(res.authorizationUrl).toBeDefined();
      expect(res.authorizationUrl).toContain("paystack.com");
      expect(res.reference).toBeDefined();
    });

    it("should verify transaction verification response structure", async () => {
      const res = await verifyPaystackTransaction("test_mock_ref_123");
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe("success");
      expect(res.data?.amount).toBeDefined();
    });
  });

  // ── 3. Webhook Lifecycle & State Transitions ───────────────────────────────
  describe("Paystack Webhook Handler Lifecycle (POST /api/webhook/paystack)", () => {
    it("should reject webhook request with invalid signature", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const req = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: {
          "x-paystack-signature": "bad_signature",
        },
        body: JSON.stringify({ event: "charge.success" }),
      });

      const res = await paystackWebhookHandler(req);
      expect(res.status).toBe(401);

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should process charge.success, create Payment record, and set subscription ACTIVE", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const reference = `paystack_test_charge_${Date.now()}`;
      const payload = {
        event: "charge.success",
        data: {
          reference,
          amount: 1200000, // ₦12,000 in Kobo
          currency: "NGN",
          metadata: {
            businessId: testBiz.id,
            planCode: "PRO",
          },
          customer: {
            customer_code: "CUS_test_abc123",
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

      const subState = await getBusinessSubscription(testBiz.id);
      expect(subState.status).toBe("ACTIVE");
      expect(subState.planCode).toBe("PRO");
      expect(subState.isActive).toBe(true);

      const payment = await prisma.payment.findUnique({
        where: { paystackReference: reference },
      });
      expect(payment).toBeDefined();
      expect(payment?.status).toBe("SUCCESS");
      expect(Number(payment?.amount)).toBe(12000);

      // Idempotency: Duplicate delivery should be handled cleanly
      const reqDuplicate = new NextRequest("http://localhost:3000/api/webhook/paystack", {
        method: "POST",
        headers: {
          "x-paystack-signature": signature,
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const resDuplicate = await paystackWebhookHandler(reqDuplicate);
      expect(resDuplicate.status).toBe(200);
      const bodyDup = await resDuplicate.json();
      expect(bodyDup.status).toBe("already_processed");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should handle invoice.payment_failed by setting status PAST_DUE", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const payload = {
        event: "invoice.payment_failed",
        data: {
          metadata: {
            businessId: testBiz.id,
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

      const sub = await prisma.subscription.findUnique({
        where: { businessId: testBiz.id },
      });
      expect(sub?.status).toBe("PAST_DUE");

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });

    it("should handle subscription.disable by setting status CANCELLED", async () => {
      const oldKey = process.env.PAYSTACK_SECRET_KEY;
      process.env.PAYSTACK_SECRET_KEY = testSecretKey;

      const payload = {
        event: "subscription.disable",
        data: {
          metadata: {
            businessId: testBiz.id,
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

      const sub = await prisma.subscription.findUnique({
        where: { businessId: testBiz.id },
      });
      expect(sub?.status).toBe("CANCELLED");
      expect(sub?.cancelledAt).toBeDefined();

      process.env.PAYSTACK_SECRET_KEY = oldKey;
    });
  });
});
