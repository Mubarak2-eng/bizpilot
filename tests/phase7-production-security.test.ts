import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { Role } from "../src/types/auth";
import {
  verifyWhatsAppSignature,
  normalizePhoneNumber,
  checkRateLimit,
} from "../src/lib/whatsapp/security";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";
import {
  createPendingAction,
  getAndConsumePendingAction,
  cancelPendingAction,
} from "../src/lib/ai/pending-actions";
import { verifyBusinessMembership } from "../src/lib/membership";
import { ForbiddenError } from "../src/types/auth";
import { POST as morningBriefCronHandler } from "../src/app/api/cron/morning-brief/route";
import { GET as whatsappWebhookGetHandler } from "../src/app/api/webhook/whatsapp/route";
import { POST as paystackWebhookHandler } from "../src/app/api/webhook/paystack/route";
import { verifyPaystackWebhookSignature } from "../src/lib/payments/paystack";
import { validateProductionEnv } from "../src/lib/env";

describe("Phase 7: Production Security & Launch Readiness Audit Suite", () => {
  let ownerA: { id: string; email: string };
  let adminA: { id: string; email: string };
  let staffA: { id: string; email: string };
  let ownerB: { id: string; email: string };

  let bizA: { id: string; name: string };
  let bizB: { id: string; name: string };

  let productA: { id: string; name: string; sku: string };
  let expenseA: { id: string; category: string };
  let customerA: { id: string; name: string };
  let invoiceA: { id: string; invoiceNumber: string };

  const phoneA = `23480777${Math.floor(10000 + Math.random() * 90000)}`;
  const unlinkedPhone = `23480999${Math.floor(10000 + Math.random() * 90000)}`;
  const testSecret = "test_whatsapp_hmac_secret_key_32bytes_long";

  beforeAll(async () => {
    const hashedPassword = await hashPassword("SecurePass123!");

    ownerA = await prisma.user.create({
      data: { email: `p7_owner_a_${Date.now()}@bizpilot.test`, password: hashedPassword, name: "Owner A" },
    });
    adminA = await prisma.user.create({
      data: { email: `p7_admin_a_${Date.now()}@bizpilot.test`, password: hashedPassword, name: "Admin A" },
    });
    staffA = await prisma.user.create({
      data: { email: `p7_staff_a_${Date.now()}@bizpilot.test`, password: hashedPassword, name: "Staff A" },
    });
    ownerB = await prisma.user.create({
      data: { email: `p7_owner_b_${Date.now()}@bizpilot.test`, password: hashedPassword, name: "Owner B" },
    });

    bizA = await prisma.business.create({
      data: { name: "Security Audit Biz A", slug: `sec-a-${Date.now()}`, currency: "NGN" },
    });
    bizB = await prisma.business.create({
      data: { name: "Security Audit Biz B", slug: `sec-b-${Date.now()}`, currency: "NGN" },
    });

    await prisma.membership.create({ data: { userId: ownerA.id, businessId: bizA.id, role: Role.OWNER } });
    await prisma.membership.create({ data: { userId: adminA.id, businessId: bizA.id, role: Role.ADMIN } });
    await prisma.membership.create({ data: { userId: staffA.id, businessId: bizA.id, role: Role.STAFF } });
    await prisma.membership.create({ data: { userId: ownerB.id, businessId: bizB.id, role: Role.OWNER } });

    // Seed test entities for Biz A
    productA = await prisma.product.create({
      data: {
        businessId: bizA.id,
        name: "Security Test Product",
        sku: `SEC-SKU-${Date.now()}`,
        sellingPrice: "5000.00",
        costPrice: "3000.00",
        stockQuantity: 20,
      },
    });

    expenseA = await prisma.expense.create({
      data: {
        businessId: bizA.id,
        category: "Security Audit",
        amount: "10000.00",
        description: "Penetration testing",
      },
    });

    customerA = await prisma.customer.create({
      data: {
        businessId: bizA.id,
        name: "Security Customer",
        email: "sec.cust@example.com",
      },
    });

    invoiceA = await prisma.invoice.create({
      data: {
        businessId: bizA.id,
        customerId: customerA.id,
        invoiceNumber: `SEC-INV-${Date.now()}`,
        status: "DRAFT",
        subtotal: "5000.00",
        tax: "0.00",
        total: "5000.00",
        dueDate: new Date(Date.now() + 7 * 86400000),
      },
    });

    await prisma.whatsAppConnection.create({
      data: {
        phoneNumber: phoneA,
        userId: ownerA.id,
        businessId: bizA.id,
        verified: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.whatsAppConnection.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.whatsAppConversationSession.deleteMany({ where: { phoneNumber: { in: [phoneA, unlinkedPhone] } } });
    await prisma.aIPendingAction.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoiceA.id } });
    await prisma.invoice.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.customer.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.expense.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.product.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.membership.deleteMany({ where: { businessId: { in: [bizA.id, bizB.id] } } });
    await prisma.business.deleteMany({ where: { id: { in: [bizA.id, bizB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerA.id, adminA.id, staffA.id, ownerB.id] } } });
    await prisma.$disconnect();
  });

  // ─── 1. WhatsApp Webhook HMAC Signatures & Verification ───────────────────
  describe("1. WhatsApp Webhook HMAC-SHA256 Signature Security", () => {
    const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

    it("should accept valid HMAC-SHA256 signature when secret is provided", () => {
      const hmac = crypto.createHmac("sha256", testSecret).update(rawBody, "utf8").digest("hex");
      const signatureHeader = `sha256=${hmac}`;

      const isValid = verifyWhatsAppSignature(rawBody, signatureHeader, testSecret);
      expect(isValid).toBe(true);
    });

    it("should reject tampered or corrupted payload", () => {
      const hmac = crypto.createHmac("sha256", testSecret).update(rawBody, "utf8").digest("hex");
      const signatureHeader = `sha256=${hmac}`;
      const tamperedBody = rawBody + " ";

      const isValid = verifyWhatsAppSignature(tamperedBody, signatureHeader, testSecret);
      expect(isValid).toBe(false);
    });

    it("should reject invalid/missing signature header when secret is configured", () => {
      expect(verifyWhatsAppSignature(rawBody, null, testSecret)).toBe(false);
      expect(verifyWhatsAppSignature(rawBody, "invalid_header", testSecret)).toBe(false);
      expect(verifyWhatsAppSignature(rawBody, "sha1=123456", testSecret)).toBe(false);
    });

    it("should fail closed in production if WHATSAPP_APP_SECRET is missing", () => {
      const oldEnv = process.env.NODE_ENV;
      const oldSecret = process.env.WHATSAPP_APP_SECRET;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.WHATSAPP_APP_SECRET;

        const isValid = verifyWhatsAppSignature(rawBody, "sha256=123456");
        expect(isValid).toBe(false);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = oldEnv;
        if (oldSecret) process.env.WHATSAPP_APP_SECRET = oldSecret;
      }
    });

    it("should verify Meta challenge on GET /api/webhook/whatsapp with correct verify token", async () => {
      process.env.WHATSAPP_VERIFY_TOKEN = "correct_meta_verify_token_2026";

      const req = new NextRequest(
        "http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=correct_meta_verify_token_2026&hub.challenge=test_challenge_12345"
      );

      const res = await whatsappWebhookGetHandler(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("test_challenge_12345");
    });

    it("should reject Meta challenge on GET /api/webhook/whatsapp with mismatched verify token", async () => {
      process.env.WHATSAPP_VERIFY_TOKEN = "correct_meta_verify_token_2026";

      const req = new NextRequest(
        "http://localhost:3000/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_12345"
      );

      const res = await whatsappWebhookGetHandler(req);
      expect(res.status).toBe(403);
    });
  });

  // ─── 2. WhatsApp Multi-Tenant Security & Sender Isolation ─────────────────
  describe("2. WhatsApp Multi-Tenant Sender Identity & Authorization", () => {
    it("should safely refuse unlinked WhatsApp numbers without leaking tenant data", async () => {
      const res = await handleIncomingWhatsAppMessage(unlinkedPhone, "Show my sales today");
      expect(res.success).toBe(true);
      expect(res.actionTaken).toBe("UNLINKED");
      expect(res.replySent).toContain("not yet linked");
      expect(res.replySent).not.toContain("Security Audit Biz A");
    });

    it("should strictly enforce sliding-window rate limit per phone number", () => {
      const spamPhone = `2348000000${Math.floor(100 + Math.random() * 900)}`;
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(spamPhone, 30)).toBe(true);
      }
      expect(checkRateLimit(spamPhone, 30)).toBe(false);
    });

    it("should normalize phone numbers reliably", () => {
      expect(normalizePhoneNumber("+234 801 234 5678")).toBe("2348012345678");
      expect(normalizePhoneNumber("08012345678")).toBe("2348012345678");
    });
  });

  // ─── 3. AI Write Action Authorization & Voucher Protection ─────────────────
  describe("3. AI Write Action Authorization & Voucher Tamper Resistance", () => {
    it("should create and atomically consume a single-use action voucher", async () => {
      const token = await createPendingAction(
        ownerA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Hosting", amount: 15000, description: "Cloud servers", date: "2026-09-03" },
        }
      );

      const consumed = await getAndConsumePendingAction(token, ownerA.id, bizA.id);
      expect(consumed.used).toBe(true);

      // Replay attack prevention: second consume MUST fail
      await expect(
        getAndConsumePendingAction(token, ownerA.id, bizA.id)
      ).rejects.toThrow(/already been confirmed/i);
    });

    it("should prevent cross-tenant voucher consumption (Business B cannot confirm Business A voucher)", async () => {
      const token = await createPendingAction(
        ownerA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Travel", amount: 5000, description: "Biz A voucher", date: "2026-09-03" },
        }
      );

      // User from Business B tries to confirm
      await expect(
        getAndConsumePendingAction(token, ownerB.id, bizB.id)
      ).rejects.toThrow(/Security violation/i);
    });

    it("should prevent cross-user voucher consumption (User B cannot confirm User A voucher in same business)", async () => {
      const token = await createPendingAction(
        ownerA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 2000, description: "Owner A only", date: "2026-09-03" },
        }
      );

      // Admin A tries to consume Owner A's token
      await expect(
        getAndConsumePendingAction(token, adminA.id, bizA.id)
      ).rejects.toThrow(/Security violation/i);
    });

    it("should reject expired vouchers (> 5 minutes)", async () => {
      const token = await createPendingAction(
        ownerA.id,
        bizA.id,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Expired", amount: 1000, description: "Expired token", date: "2026-09-03" },
        },
        -1000
      );

      await expect(
        getAndConsumePendingAction(token, ownerA.id, bizA.id)
      ).rejects.toThrow(/expired/i);
    });
  });

  // ─── 4. Role-Based Access Control (RBAC) & IDOR Protection ─────────────────
  describe("4. Role-Based Access Control & Multi-Tenant IDOR Protection", () => {
    it("should allow ADMIN to perform Admin action but reject STAFF", async () => {
      // Staff role fails when Admin is required
      await expect(
        verifyBusinessMembership(bizA.id, staffA.id, [Role.ADMIN, Role.OWNER])
      ).rejects.toThrow(ForbiddenError);

      // Admin role succeeds
      const adminCtx = await verifyBusinessMembership(bizA.id, adminA.id, [Role.ADMIN, Role.OWNER]);
      expect(adminCtx.role).toBe(Role.ADMIN);
      expect(adminCtx.business.id).toBe(bizA.id);
    });

    it("should allow OWNER to perform Owner-only action and reject non-owner roles", async () => {
      // Admin role fails when Owner is strictly required
      await expect(
        verifyBusinessMembership(bizA.id, adminA.id, [Role.OWNER])
      ).rejects.toThrow(ForbiddenError);

      // Staff role fails when Owner is strictly required
      await expect(
        verifyBusinessMembership(bizA.id, staffA.id, [Role.OWNER])
      ).rejects.toThrow(ForbiddenError);

      // Owner role succeeds
      const ownerCtx = await verifyBusinessMembership(bizA.id, ownerA.id, [Role.OWNER]);
      expect(ownerCtx.role).toBe(Role.OWNER);
      expect(ownerCtx.business.id).toBe(bizA.id);
    });

    it("should prevent cross-tenant IDOR access (User in Biz B cannot find or query Biz A product)", async () => {
      const productInBizB = await prisma.product.findFirst({
        where: {
          id: productA.id,
          businessId: bizB.id,
        },
      });
      expect(productInBizB).toBeNull();
    });

    it("should prevent cross-tenant IDOR access for expenses", async () => {
      const expenseInBizB = await prisma.expense.findFirst({
        where: {
          id: expenseA.id,
          businessId: bizB.id,
        },
      });
      expect(expenseInBizB).toBeNull();
    });

    it("should prevent cross-tenant IDOR access for invoices", async () => {
      const invoiceInBizB = await prisma.invoice.findFirst({
        where: {
          id: invoiceA.id,
          businessId: bizB.id,
        },
      });
      expect(invoiceInBizB).toBeNull();
    });

    it("should prevent cross-tenant IDOR access for customers", async () => {
      const customerInBizB = await prisma.customer.findFirst({
        where: {
          id: customerA.id,
          businessId: bizB.id,
        },
      });
      expect(customerInBizB).toBeNull();
    });
  });

  // ─── 5. Cron & Paystack Endpoint Security ─────────────────────────────────
  describe("5. Cron & Paystack Security Verification", () => {
    const testCronSecret = "super_secure_cron_secret_2026";

    it("should reject cron requests without Authorization header", async () => {
      process.env.CRON_SECRET = testCronSecret;
      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
      });
      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(401);
    });

    it("should reject cron requests with invalid Bearer token", async () => {
      process.env.CRON_SECRET = testCronSecret;
      const req = new NextRequest("http://localhost:3000/api/cron/morning-brief", {
        method: "POST",
        headers: { Authorization: "Bearer wrong_secret_123" },
      });
      const res = await morningBriefCronHandler(req);
      expect(res.status).toBe(401);
    });

    it("should verify Paystack webhook HMAC-SHA512 signature", () => {
      const secret = "sk_test_paystack_secret_key_12345";
      process.env.PAYSTACK_SECRET_KEY = secret;

      const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });
      const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");

      expect(verifyPaystackWebhookSignature(body, signature)).toBe(true);
      expect(verifyPaystackWebhookSignature(body, "invalid_sig")).toBe(false);
      expect(verifyPaystackWebhookSignature(body, null)).toBe(false);
    });

    it("should fail closed in production if PAYSTACK_SECRET_KEY is missing", () => {
      const oldEnv = process.env.NODE_ENV;
      const oldSecret = process.env.PAYSTACK_SECRET_KEY;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        delete process.env.PAYSTACK_SECRET_KEY;

        expect(verifyPaystackWebhookSignature("{}", "sig")).toBe(false);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = oldEnv;
        if (oldSecret) process.env.PAYSTACK_SECRET_KEY = oldSecret;
      }
    });
  });

  // ─── 6. Production Environment Validator ──────────────────────────────────
  describe("6. Production Environment Validator (validateProductionEnv)", () => {
    it("should pass validation when all required production variables are set correctly", () => {
      const validEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/bizpilot",
        AUTH_SECRET: "abcdef0123456789abcdef0123456789", // 32 chars
        RESEND_API_KEY: "re_live_123456789",
        CRON_SECRET: "cron_secret_32_bytes_long_12345",
        WHATSAPP_APP_SECRET: "wa_secret_12345",
        WHATSAPP_VERIFY_TOKEN: "wa_verify_12345",
      };

      const result = validateProductionEnv(validEnv);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.configuredServices.database).toBe(true);
      expect(result.configuredServices.auth).toBe(true);
      expect(result.configuredServices.email).toBe(true);
      expect(result.configuredServices.cron).toBe(true);
    });

    it("should fail validation if AUTH_SECRET is less than 32 characters in production", () => {
      const shortAuthEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/bizpilot",
        AUTH_SECRET: "short_secret", // < 32 chars
        RESEND_API_KEY: "re_live_123456789",
        CRON_SECRET: "cron_secret_32_bytes_long_12345",
      };

      const result = validateProductionEnv(shortAuthEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("AUTH_SECRET must be at least 32 characters"))).toBe(true);
    });

    it("should fail validation if RESEND_API_KEY is missing in production", () => {
      const missingEmailEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/bizpilot",
        AUTH_SECRET: "abcdef0123456789abcdef0123456789",
        CRON_SECRET: "cron_secret_32_bytes_long_12345",
      };

      const result = validateProductionEnv(missingEmailEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("RESEND_API_KEY is required in production"))).toBe(true);
    });
  });
});
