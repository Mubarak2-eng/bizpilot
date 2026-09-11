import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  initializeFlutterwaveTransaction,
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhookSignature,
} from "../src/lib/payments/flutterwave";
import { POST as flutterwaveWebhookHandler } from "../src/app/api/webhook/flutterwave/route";
import { ensureDefaultPlans } from "../src/lib/subscriptions/service";
import { hashPassword } from "../src/lib/password";
import { Role } from "../src/types/auth";
import { NextRequest } from "next/server";

describe("Flutterwave Payments & Subscription Integration Suite", () => {
  const testSecretHash = "test_flw_secret_hash_2026";
  let testUser: { id: string; email: string };
  let testBusiness: { id: string; name: string };
  let otherBusiness: { id: string; name: string };

  beforeAll(async () => {
    process.env.FLW_WEBHOOK_SECRET = testSecretHash;
    process.env.FLUTTERWAVE_SECRET_HASH = testSecretHash;
    process.env.FLW_SECRET_KEY = "FLWSECK_TEST_mock_123456";
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST_mock_123456";
    await ensureDefaultPlans();

    const timestamp = Date.now();
    const hashedPassword = await hashPassword("FlutterwaveTest123!");

    testUser = await prisma.user.create({
      data: {
        email: `flw_owner_${timestamp}@bizpilot.test`,
        name: "FLW Test Owner",
        password: hashedPassword,
      },
    });

    testBusiness = await prisma.business.create({
      data: {
        name: `FLW Store ${timestamp}`,
        slug: `flw-store-${timestamp}`,
        currency: "NGN",
        memberships: {
          create: {
            userId: testUser.id,
            role: Role.ADMIN,
          },
        },
      },
    });

    otherBusiness = await prisma.business.create({
      data: {
        name: `Other Store ${timestamp}`,
        slug: `other-store-${timestamp}`,
        currency: "NGN",
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.payment.deleteMany({
      where: {
        paystackReference: { startsWith: "bp_flw_test_" },
      },
    }).catch(() => {});
    
    if (testBusiness?.id) {
      await prisma.subscription.deleteMany({ where: { businessId: testBusiness.id } }).catch(() => {});
      await prisma.membership.deleteMany({ where: { businessId: testBusiness.id } }).catch(() => {});
      await prisma.business.delete({ where: { id: testBusiness.id } }).catch(() => {});
    }
    if (otherBusiness?.id) {
      await prisma.business.delete({ where: { id: otherBusiness.id } }).catch(() => {});
    }
    if (testUser?.id) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  });

  describe("1. Checkout Initialization", () => {
    it("initializes a valid Flutterwave checkout session with correct parameters", async () => {
      const txRef = `bp_flw_test_${Date.now()}`;
      const res = await initializeFlutterwaveTransaction({
        email: testUser.email,
        name: "Test User",
        amountInNaira: 12000,
        currency: "NGN",
        txRef,
        metadata: {
          businessId: testBusiness.id,
          planCode: "PRO",
        },
      });

      expect(res.success).toBe(true);
      expect(res.txRef).toBe(txRef);
      expect(res.paymentLink).toBeDefined();
      expect(res.paymentLink).toContain(txRef);
    });

    it("generates a unique txRef if none is provided", async () => {
      const res = await initializeFlutterwaveTransaction({
        email: testUser.email,
        amountInNaira: 25000,
      });

      expect(res.success).toBe(true);
      expect(res.txRef).toMatch(/^bp_flw_/);
    });
  });

  describe("2. Webhook Signature Security (verif-hash)", () => {
    it("accepts valid verif-hash signature header", () => {
      const isValid = verifyFlutterwaveWebhookSignature(testSecretHash);
      expect(isValid).toBe(true);
    });

    it("rejects invalid or tampered verif-hash signature", () => {
      const isValid = verifyFlutterwaveWebhookSignature("invalid_hash_signature");
      expect(isValid).toBe(false);
    });

    it("rejects null or empty verif-hash header", () => {
      expect(verifyFlutterwaveWebhookSignature(null)).toBe(false);
      expect(verifyFlutterwaveWebhookSignature("")).toBe(false);
    });
  });

  describe("3. Webhook Event Processing & Idempotency", () => {
    it("successfully processes charge.completed and activates subscription", async () => {
      const txRef = `bp_flw_test_success_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998811,
          tx_ref: txRef,
          flw_ref: `FLW_${txRef}`,
          amount: 12000,
          currency: "NGN",
          status: "successful",
          customer: {
            id: 4567,
            name: "FLW Test Owner",
            email: testUser.email,
          },
          meta: {
            businessId: testBusiness.id,
            planCode: "PRO",
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": testSecretHash,
        },
        body: JSON.stringify(payload),
      });

      const res = await flutterwaveWebhookHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe("activated");

      // Verify DB record
      const subscription = await prisma.subscription.findUnique({
        where: { businessId: testBusiness.id },
        include: { plan: true },
      });

      expect(subscription).toBeDefined();
      expect(subscription?.status).toBe("ACTIVE");
      expect(subscription?.plan.code).toBe("PRO");

      const payment = await prisma.payment.findUnique({
        where: { paystackReference: txRef },
      });
      expect(payment).toBeDefined();
      expect(payment?.status).toBe("SUCCESS");
      expect(Number(payment?.amount)).toBe(12000);
    });

    it("idempotently handles duplicate webhook events without double processing", async () => {
      const txRef = `bp_flw_test_dup_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998812,
          tx_ref: txRef,
          flw_ref: `FLW_${txRef}`,
          amount: 12000,
          currency: "NGN",
          status: "successful",
          customer: { email: testUser.email },
          meta: {
            businessId: testBusiness.id,
            planCode: "PRO",
          },
        },
      };

      const makeRequest = () =>
        new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "verif-hash": testSecretHash,
          },
          body: JSON.stringify(payload),
        });

      // First webhook event
      const res1 = await flutterwaveWebhookHandler(makeRequest());
      expect(res1.status).toBe(200);

      // Duplicate webhook event
      const res2 = await flutterwaveWebhookHandler(makeRequest());
      const json2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(json2.note).toBe("duplicate_skipped");
    });

    it("rejects underpayment attempts (amount < plan price)", async () => {
      const txRef = `bp_flw_test_underpaid_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998813,
          tx_ref: txRef,
          amount: 500, // NGN 500 instead of NGN 12,000
          currency: "NGN",
          status: "successful",
          meta: {
            businessId: testBusiness.id,
            planCode: "PRO",
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": testSecretHash,
        },
        body: JSON.stringify(payload),
      });

      const res = await flutterwaveWebhookHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Underpayment rejected");
    });

    it("rejects payments with foreign currencies (currency !== NGN)", async () => {
      const txRef = `bp_flw_test_curr_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998814,
          tx_ref: txRef,
          amount: 12000,
          currency: "USD",
          status: "successful",
          meta: {
            businessId: testBusiness.id,
            planCode: "PRO",
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": testSecretHash,
        },
        body: JSON.stringify(payload),
      });

      const res = await flutterwaveWebhookHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Only NGN supported");
    });

    it("rejects webhooks with unknown or cross-tenant business ID", async () => {
      const txRef = `bp_flw_test_unknown_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998815,
          tx_ref: txRef,
          amount: 12000,
          currency: "NGN",
          status: "successful",
          meta: {
            businessId: "non_existent_business_id_999",
            planCode: "PRO",
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": testSecretHash,
        },
        body: JSON.stringify(payload),
      });

      const res = await flutterwaveWebhookHandler(req);
      expect(res.status).toBe(404);
    });

    it("ignores non-successful status events safely without activating", async () => {
      const txRef = `bp_flw_test_failed_${Date.now()}`;
      const payload = {
        event: "charge.completed",
        data: {
          id: 998816,
          tx_ref: txRef,
          amount: 12000,
          currency: "NGN",
          status: "failed",
          meta: {
            businessId: testBusiness.id,
            planCode: "PRO",
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhook/flutterwave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": testSecretHash,
        },
        body: JSON.stringify(payload),
      });

      const res = await flutterwaveWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.note).toBe("non_successful_status_ignored");
    });
  });

  describe("4. Transaction Verification Helper", () => {
    it("verifies transaction status and data successfully", async () => {
      const txRef = `bp_flw_test_verify_${Date.now()}`;
      const verifyRes = await verifyFlutterwaveTransaction(txRef);

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.data).toBeDefined();
      expect(verifyRes.data?.status).toBe("successful");
      expect(verifyRes.data?.tx_ref).toBe(txRef);
    });
  });

  describe("5. Environment Configuration & Variable Resolution (FLW_*)", () => {
    const originalEnv = { ...process.env };

    afterAll(() => {
      process.env = originalEnv;
    });

    it("correctly resolves FLW_SECRET_KEY, FLW_PUBLIC_KEY, and FLW_WEBHOOK_SECRET", async () => {
      const {
        getFlutterwaveSecretKey,
        getFlutterwavePublicKey,
        getFlutterwaveWebhookSecret,
      } = await import("../src/lib/payments/flutterwave");

      delete process.env.FLUTTERWAVE_SECRET_KEY;
      delete process.env.FLUTTERWAVE_PUBLIC_KEY;
      delete process.env.FLUTTERWAVE_SECRET_HASH;

      process.env.FLW_SECRET_KEY = "FLWSECK_TEST_mock_custom_key";
      process.env.FLW_PUBLIC_KEY = "FLWPUBK_TEST_mock_custom_key";
      process.env.FLW_WEBHOOK_SECRET = "custom_flw_webhook_secret_2026";

      expect(getFlutterwaveSecretKey()).toBe("FLWSECK_TEST_mock_custom_key");
      expect(getFlutterwavePublicKey()).toBe("FLWPUBK_TEST_mock_custom_key");
      expect(getFlutterwaveWebhookSecret()).toBe("custom_flw_webhook_secret_2026");

      // Verify signature check against FLW_WEBHOOK_SECRET
      expect(verifyFlutterwaveWebhookSignature("custom_flw_webhook_secret_2026")).toBe(true);
      expect(verifyFlutterwaveWebhookSignature("wrong_secret")).toBe(false);
    });

    it("falls back gracefully to FLUTTERWAVE_* aliases when FLW_* is omitted", async () => {
      const {
        getFlutterwaveSecretKey,
        getFlutterwavePublicKey,
        getFlutterwaveWebhookSecret,
      } = await import("../src/lib/payments/flutterwave");

      delete process.env.FLW_SECRET_KEY;
      delete process.env.FLW_PUBLIC_KEY;
      delete process.env.FLW_WEBHOOK_SECRET;

      process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST_mock_alias_key";
      process.env.FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST_mock_alias_key";
      process.env.FLUTTERWAVE_SECRET_HASH = "alias_hash_2026";

      expect(getFlutterwaveSecretKey()).toBe("FLWSECK_TEST_mock_alias_key");
      expect(getFlutterwavePublicKey()).toBe("FLWPUBK_TEST_mock_alias_key");
      expect(getFlutterwaveWebhookSecret()).toBe("alias_hash_2026");
    });

    it("production environment validator recognizes FLW_SECRET_KEY", async () => {
      const { validateProductionEnv } = await import("../src/lib/env");

      const testEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/bizpilot",
        AUTH_SECRET: "abcdef0123456789abcdef0123456789",
        RESEND_API_KEY: "re_live_123456789",
        CRON_SECRET: "cron_secret_32_bytes_long_12345",
        WHATSAPP_ACCESS_TOKEN: "wa_access_token_12345",
        WHATSAPP_PHONE_NUMBER_ID: "109876543210987",
        WHATSAPP_APP_SECRET: "wa_secret_12345",
        WHATSAPP_VERIFY_TOKEN: "wa_verify_12345",
        FLW_SECRET_KEY: "FLWSECK-live_secret_key_12345",
        FLW_WEBHOOK_SECRET: "flw_webhook_secret_12345",
      };

      const res = validateProductionEnv(testEnv);
      expect(res.isValid).toBe(true);
      expect(res.configuredServices.flutterwave).toBe(true);
    });
  });
});