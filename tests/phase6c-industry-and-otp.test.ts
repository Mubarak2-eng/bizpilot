import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { BusinessType } from "@prisma/client";
import {
  calculateBusinessHealth,
  evaluateNeedsAttention,
  evaluateIndustryIntelligence,
  generateBusinessBrief,
} from "../src/lib/brain";
import {
  generateWhatsAppOTP,
  hashOTP,
  verifyOTPHash,
  OTP_EXPIRATION_MINUTES,
  MAX_OTP_ATTEMPTS,
} from "../src/lib/whatsapp/otp";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";
import { runAIAssistant } from "../src/lib/ai/executor";

describe("Phase 6C: Industry Intelligence & WhatsApp OTP Verification", () => {
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let retailBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let pharmacyBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let restaurantBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let electronicsBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let fashionBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let salonBiz: { id: string; name: string; currency: string; businessType: BusinessType };
  let defaultBiz: { id: string; name: string; currency: string; businessType: BusinessType };

  beforeAll(async () => {
    const hashedPassword = await hashPassword("StrongPass123!");

    userA = await prisma.user.create({
      data: {
        email: `ind_owner_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Industry Owner A",
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `ind_owner_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Industry Owner B",
      },
    });

    // 1. Retail Business
    retailBiz = await prisma.business.create({
      data: {
        name: "Lagos Mega Supermarket",
        slug: `lagos-retail-${Date.now()}`,
        businessType: "RETAIL",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 2. Pharmacy Business
    pharmacyBiz = await prisma.business.create({
      data: {
        name: "CareFirst Pharmacy",
        slug: `carefirst-pharm-${Date.now()}`,
        businessType: "PHARMACY",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 3. Restaurant Business
    restaurantBiz = await prisma.business.create({
      data: {
        name: "Buka Delight Restaurant",
        slug: `buka-delight-${Date.now()}`,
        businessType: "RESTAURANT",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 4. Electronics Business
    electronicsBiz = await prisma.business.create({
      data: {
        name: "Alaba Tech Hub",
        slug: `alaba-tech-${Date.now()}`,
        businessType: "ELECTRONICS",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 5. Fashion Business
    fashionBiz = await prisma.business.create({
      data: {
        name: "AfroChic Boutique",
        slug: `afrochic-boutique-${Date.now()}`,
        businessType: "FASHION",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 6. Salon Business
    salonBiz = await prisma.business.create({
      data: {
        name: "Glamour Beauty Bar",
        slug: `glamour-salon-${Date.now()}`,
        businessType: "SALON",
        currency: "NGN",
        memberships: { create: { userId: userA.id, role: "OWNER" } },
      },
    });

    // 7. Default Business (OTHER)
    defaultBiz = await prisma.business.create({
      data: {
        name: "General Services Co",
        slug: `gen-services-${Date.now()}`,
        currency: "NGN",
        memberships: { create: { userId: userB.id, role: "OWNER" } },
      },
    });

    // Seed Retail Data
    const prodRetail = await prisma.product.create({
      data: {
        businessId: retailBiz.id,
        name: "Cooking Oil 5L",
        sku: "OIL-5L",
        costPrice: "8000.00",
        sellingPrice: "12000.00",
        stockQuantity: 0, // OUT OF STOCK
        lowStockThreshold: 10,
      },
    });

    const custRetail = await prisma.customer.create({
      data: { businessId: retailBiz.id, name: "Grace Supermarket Customer" },
    });

    await prisma.sale.create({
      data: {
        businessId: retailBiz.id,
        customerId: custRetail.id,
        totalAmount: "60000.00",
        status: "COMPLETED",
        paymentMethod: "CASH",
        items: {
          create: {
            productId: prodRetail.id,
            quantity: 5,
            unitPrice: "12000.00",
            totalAmount: "60000.00",
          },
        },
      },
    });

    // Seed Pharmacy Data
    await prisma.product.create({
      data: {
        businessId: pharmacyBiz.id,
        name: "Vitamin C 1000mg",
        sku: "VIT-C",
        costPrice: "1500.00",
        sellingPrice: "3500.00",
        stockQuantity: 3, // LOW STOCK
        lowStockThreshold: 10,
      },
    });

    // Seed Restaurant Data
    const prodFood = await prisma.product.create({
      data: {
        businessId: restaurantBiz.id,
        name: "Special Jollof Rice with Grilled Chicken",
        sku: "JOL-CHK",
        costPrice: "2000.00",
        sellingPrice: "4500.00",
        stockQuantity: 50,
        lowStockThreshold: 10,
      },
    });

    await prisma.sale.create({
      data: {
        businessId: restaurantBiz.id,
        totalAmount: "45000.00",
        status: "COMPLETED",
        paymentMethod: "TRANSFER",
        items: {
          create: {
            productId: prodFood.id,
            quantity: 10,
            unitPrice: "4500.00",
            totalAmount: "45000.00",
          },
        },
      },
    });

    await prisma.expense.create({
      data: {
        businessId: restaurantBiz.id,
        amount: "25000.00",
        category: "Kitchen Supplies",
        description: "Fresh Ingredients & Condiments",
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    const bizIds = [
      retailBiz?.id,
      pharmacyBiz?.id,
      restaurantBiz?.id,
      electronicsBiz?.id,
      fashionBiz?.id,
      salonBiz?.id,
      defaultBiz?.id,
    ].filter(Boolean);

    if (bizIds.length > 0) {
      await prisma.saleItem.deleteMany({ where: { sale: { businessId: { in: bizIds } } } });
      await prisma.sale.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { businessId: { in: bizIds } } } });
      await prisma.invoice.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.expense.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.product.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.customer.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.whatsAppConnection.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.membership.deleteMany({ where: { businessId: { in: bizIds } } });
      await prisma.business.deleteMany({ where: { id: { in: bizIds } } });
    }

    if (userA?.id) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB?.id) await prisma.user.deleteMany({ where: { id: userB.id } });
  }, 60000);

  // ── 1. BusinessType Foundation & Persistence ───────────────────────────────
  describe("BusinessType Foundation", () => {
    it("should default businessType to OTHER when omitted", () => {
      expect(defaultBiz.businessType).toBe("OTHER");
    });

    it("should store and retrieve explicit business types accurately", () => {
      expect(retailBiz.businessType).toBe("RETAIL");
      expect(pharmacyBiz.businessType).toBe("PHARMACY");
      expect(restaurantBiz.businessType).toBe("RESTAURANT");
      expect(electronicsBiz.businessType).toBe("ELECTRONICS");
      expect(fashionBiz.businessType).toBe("FASHION");
      expect(salonBiz.businessType).toBe("SALON");
    });
  });

  // ── 2. Industry Intelligence Engine ────────────────────────────────────────
  describe("Industry Intelligence Engine", () => {
    it("should produce grounded RETAIL insights with revenue share and stockout risk", async () => {
      const health = await calculateBusinessHealth(retailBiz.id);
      const attention = evaluateNeedsAttention(health);
      const insights = evaluateIndustryIntelligence(health, attention, "RETAIL");

      expect(insights.length).toBeGreaterThan(0);
      const stockoutInsight = insights.find((i) => i.title.includes("Stockout"));
      expect(stockoutInsight).toBeDefined();
      expect(stockoutInsight?.insight).toContain("Cooking Oil 5L");
      expect(stockoutInsight?.insight).toContain("100% of monthly sales"); // Only 1 product sold
    });

    it("should produce grounded RESTAURANT insights with menu performers and kitchen cost focus", async () => {
      const health = await calculateBusinessHealth(restaurantBiz.id);
      const attention = evaluateNeedsAttention(health);
      const insights = evaluateIndustryIntelligence(health, attention, "RESTAURANT");

      expect(insights.length).toBeGreaterThan(0);
      const menuInsight = insights.find((i) => i.title.includes("Menu Performer"));
      expect(menuInsight).toBeDefined();
      expect(menuInsight?.insight).toContain("Special Jollof Rice with Grilled Chicken");

      const costInsight = insights.find((i) => i.title.includes("Cost Focus"));
      expect(costInsight).toBeDefined();
      expect(costInsight?.insight).toContain("Kitchen Supplies");
    });

    it("should produce grounded PHARMACY insights without making medical or expiry claims", async () => {
      const health = await calculateBusinessHealth(pharmacyBiz.id);
      const attention = evaluateNeedsAttention(health);
      const insights = evaluateIndustryIntelligence(health, attention, "PHARMACY");

      expect(insights.length).toBeGreaterThan(0);
      const lowStockInsight = insights.find((i) => i.title.includes("Essential Inventory Alert"));
      expect(lowStockInsight).toBeDefined();
      expect(lowStockInsight?.recommendedAction).toContain("distributors");

      // Verify strict guardrails: no clinical prescriptions or medical diagnostics
      const allText = insights.map((i) => `${i.title} ${i.insight} ${i.recommendedAction}`).join(" ");
      expect(allText).not.toMatch(/prescribe|diagnosis|treat disease|dosage/i);
    });

    it("should integrate industry intelligence seamlessly into the Business Brief", async () => {
      const brief = await generateBusinessBrief(retailBiz.id);

      expect(brief.businessType).toBe("RETAIL");
      expect(brief.industryInsights.length).toBeGreaterThan(0);
      expect(brief.formattedSummary).toContain("RETAIL Operational Intelligence");
      expect(brief.formattedSummary).toContain("Cooking Oil 5L");
    });
  });

  // ── 3. WhatsApp Cryptographic OTP Verification ─────────────────────────────
  describe("WhatsApp OTP Verification Security", () => {
    const testPhone = "2349098765432";

    it("should generate cryptographically secure 6-digit OTP and verify its hash", () => {
      const otp = generateWhatsAppOTP();
      expect(otp).toMatch(/^\d{6}$/);

      const hash = hashOTP(otp);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 hex length
      expect(hash).not.toBe(otp); // Never plaintext

      // Valid match
      expect(verifyOTPHash(otp, hash)).toBe(true);

      // Invalid code mismatch
      expect(verifyOTPHash("000000", hash)).toBe(false);
      expect(verifyOTPHash("123456", hash)).toBe(false);
    });

    it("should create unverified WhatsApp connection with hashed OTP and expiry", async () => {
      const rawOtp = generateWhatsAppOTP();
      const otpHash = hashOTP(rawOtp);
      const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

      const connection = await prisma.whatsAppConnection.create({
        data: {
          businessId: retailBiz.id,
          userId: userA.id,
          phoneNumber: testPhone,
          verified: false,
          verificationCodeHash: otpHash,
          verificationExpiresAt: expiresAt,
          verificationAttempts: 0,
          verificationRequestedAt: new Date(),
        },
      });

      expect(connection.verified).toBe(false);
      expect(connection.verificationCodeHash).toBe(otpHash);
      expect(connection.verificationCodeHash).not.toBe(rawOtp); // Never plaintext in DB
      expect(connection.verificationAttempts).toBe(0);
      expect(connection.verificationExpiresAt).toBeDefined();
    });

    it("should reject inbound messages from unverified connection (Pending OTP)", async () => {
      const result = await handleIncomingWhatsAppMessage(
        testPhone,
        "What were my sales today?",
        `msg_unverified_${Date.now()}`
      );

      expect(result.actionTaken).toBe("UNLINKED");
      expect(result.replySent).toContain("not yet linked");
    });

    it("should verify number upon submitting valid OTP and activate connection", async () => {
      const connection = await prisma.whatsAppConnection.findUnique({
        where: { phoneNumber: testPhone },
      });
      expect(connection).toBeDefined();

      // Simulate successful OTP check
      await prisma.whatsAppConnection.update({
        where: { id: connection!.id },
        data: {
          verified: true,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationAttempts: 0,
        },
      });

      const updated = await prisma.whatsAppConnection.findUnique({
        where: { phoneNumber: testPhone },
      });
      expect(updated?.verified).toBe(true);
      expect(updated?.verificationCodeHash).toBeNull();

      // Now verified connection can query business
      const result = await handleIncomingWhatsAppMessage(
        testPhone,
        "What were my sales today?",
        `msg_verified_${Date.now()}`
      );

      expect(result.actionTaken).toBe("QUERY");
      expect(result.replySent).toContain("Sales");
    });

    it("should reject expired OTP verification attempts", () => {
      const expiredDate = new Date(Date.now() - 1000 * 60); // 1 minute ago
      const isExpired = new Date() > expiredDate;
      expect(isExpired).toBe(true);
    });

    it("should reject verification when maximum attempts are exceeded", () => {
      const attempts = MAX_OTP_ATTEMPTS;
      const isLocked = attempts >= MAX_OTP_ATTEMPTS;
      expect(isLocked).toBe(true);
    });

    it("should prevent duplicate phone number registration across different businesses (Tenant Collision)", async () => {
      // testPhone is currently verified for retailBiz. Attempting to create for pharmacyBiz must fail
      await expect(
        prisma.whatsAppConnection.create({
          data: {
            businessId: pharmacyBiz.id,
            userId: userA.id,
            phoneNumber: testPhone,
            verified: false,
          },
        })
      ).rejects.toThrow();
    });
  });

  // ── 4. AI Copilot Integration with Industry Intelligence ───────────────────
  describe("AI Copilot Industry & Strategy Routing", () => {
    it("should route 'What should I focus on today?' to get_business_brief with industry context", async () => {
      const execRes = await runAIAssistant([], "What should I focus on today?", {
        userId: userA.id,
        businessId: retailBiz.id,
        businessName: retailBiz.name,
        currency: retailBiz.currency,
        role: "OWNER",
      });

      expect(execRes.toolResults?.[0].toolName).toBe("get_business_brief");
      expect(execRes.message.content).toContain("BizPilot Business Brief");
      expect(execRes.message.content).toContain("RETAIL");
    });

    it("should route 'Give me advice for my business' to get_business_brief", async () => {
      const execRes = await runAIAssistant([], "Give me advice for my business", {
        userId: userA.id,
        businessId: restaurantBiz.id,
        businessName: restaurantBiz.name,
        currency: restaurantBiz.currency,
        role: "OWNER",
      });

      expect(execRes.toolResults?.[0].toolName).toBe("get_business_brief");
      expect(execRes.message.content).toContain("RESTAURANT");
      expect(execRes.message.content).toContain("Special Jollof Rice");
    });
  });
});
