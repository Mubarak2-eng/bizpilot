import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  formatDebtorReminderMessage,
  buildWhatsAppClickToChatUrl,
  calculateOverdueDays,
} from "../src/lib/debtors/messaging";
import {
  getDebtorReminderPreviewAction,
  sendDebtorWhatsAppReminderAction,
  sendDebtorEmailReminderAction,
} from "../src/lib/actions/debtors";
import { createSaleAction } from "../src/lib/actions/sales";
import { Role } from "../src/types/auth";

// Mock next/cache revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockUserId = "";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(async () => {
    const user = await prisma.user.findUnique({ where: { id: mockUserId } });
    if (!user) throw new Error("Unauthorized");
    return user;
  }),
  requireBusinessMembership: vi.fn(async (businessId: string) => {
    const user = await prisma.user.findUnique({ where: { id: mockUserId } });
    if (!user) throw new Error("Unauthorized");

    const membership = await prisma.membership.findUnique({
      where: {
        userId_businessId: {
          userId: user.id,
          businessId,
        },
      },
      include: { business: true },
    });

    if (!membership) {
      throw new Error("Access denied: You are not a member of this business.");
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      business: membership.business,
      role: membership.role as Role,
      membership,
    };
  }),
  requireBusinessRole: vi.fn(async (businessId: string, minRole: Role) => {
    const user = await prisma.user.findUnique({ where: { id: mockUserId } });
    if (!user) throw new Error("Unauthorized");

    const membership = await prisma.membership.findUnique({
      where: {
        userId_businessId: {
          userId: user.id,
          businessId,
        },
      },
      include: { business: true },
    });

    if (!membership) {
      throw new Error("Access denied: You are not a member of this business.");
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      business: membership.business,
      role: membership.role as Role,
      membership,
    };
  }),
}));

describe("Debtor Messaging & Payment Reminder System", () => {
  let primaryBusiness: { id: string; name: string; currency: string };
  let secondaryBusiness: { id: string; name: string; currency: string };
  let testCustomerWithDebt: { id: string; name: string; phone: string | null; email: string | null };
  let testCustomerNoDebt: { id: string; name: string; phone: string | null; email: string | null };
  let secondaryCustomer: { id: string; name: string };
  let testProduct: { id: string; name: string; sellingPrice: string; stockQuantity: number };
  let creditSaleId = "";

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!owner || !biz1 || !biz2) {
      throw new Error("Required seed data is missing for test run!");
    }

    mockUserId = owner.id;
    primaryBusiness = biz1;
    secondaryBusiness = biz2;

    // Create product
    const prod = await prisma.product.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Smart Keyboard Pro-${Date.now()}`,
        sku: `KEY-${Date.now()}`,
        sellingPrice: "45000.00",
        costPrice: "30000.00",
        stockQuantity: 100,
      },
    });
    testProduct = {
      id: prod.id,
      name: prod.name,
      sellingPrice: prod.sellingPrice.toString(),
      stockQuantity: prod.stockQuantity,
    };

    // Create customer with debt in primary business
    const debtor = await prisma.customer.create({
      data: {
        businessId: primaryBusiness.id,
        name: "Ada Lovelace",
        phone: "08012345678",
        email: "ada.lovelace@techcorp.test",
        address: "12 Innovation Hub, Lagos",
      },
    });
    testCustomerWithDebt = {
      id: debtor.id,
      name: debtor.name,
      phone: debtor.phone,
      email: debtor.email,
    };

    // Create customer with zero debt in primary business
    const settledCust = await prisma.customer.create({
      data: {
        businessId: primaryBusiness.id,
        name: "Settled Sam",
        phone: "08099887766",
        email: "settled.sam@example.test",
      },
    });
    testCustomerNoDebt = {
      id: settledCust.id,
      name: settledCust.name,
      phone: settledCust.phone,
      email: settledCust.email,
    };

    // Create customer in secondary business
    const secCust = await prisma.customer.create({
      data: {
        businessId: secondaryBusiness.id,
        name: "Beta Debtor",
        phone: "08123456789",
        email: "beta.debtor@beta.test",
      },
    });
    secondaryCustomer = {
      id: secCust.id,
      name: secCust.name,
    };

    // Create an overdue credit sale for testCustomerWithDebt
    const pastDueDate = new Date();
    pastDueDate.setDate(pastDueDate.getDate() - 5); // 5 days ago

    const saleRes = await createSaleAction(primaryBusiness.id, {
      customerId: testCustomerWithDebt.id,
      paymentMethod: "CREDIT",
      isCredit: true,
      creditDueDate: pastDueDate.toISOString().split("T")[0],
      initialPaymentAmount: 15000,
      items: [
        {
          productId: testProduct.id,
          quantity: 2, // 2 * 45,000 = 90,000; deposit 15,000 -> balance 75,000
        },
      ],
    });

    if (!saleRes.success || !saleRes.saleId) {
      throw new Error(`Failed to create test credit sale: ${saleRes.error}`);
    }
    creditSaleId = saleRes.saleId;
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.creditPayment.deleteMany({
      where: { businessId: primaryBusiness.id },
    });
    await prisma.saleItem.deleteMany({
      where: { productId: testProduct.id },
    });
    await prisma.sale.deleteMany({
      where: { customerId: { in: [testCustomerWithDebt.id, testCustomerNoDebt.id] } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: [testCustomerWithDebt.id, testCustomerNoDebt.id, secondaryCustomer.id] } },
    });
    await prisma.product.deleteMany({
      where: { id: testProduct.id },
    });
    await prisma.$disconnect();
  });

  describe("1. Template Generation & Formatting", () => {
    it("should format Friendly payment reminder correctly with dynamic values", () => {
      const message = formatDebtorReminderMessage("FRIENDLY", {
        customerName: "Ada Lovelace",
        businessName: "Acme Electronics",
        currency: "NGN",
        outstandingBalance: 75000,
        dueDate: "2026-09-15",
        itemsSummary: "2x Smart Keyboard Pro",
      });

      expect(message).toContain("Hello Ada Lovelace");
      expect(message).toContain("Acme Electronics");
      expect(message).toContain("₦75,000.00");
      expect(message).toContain("2x Smart Keyboard Pro");
      expect(message).toContain("friendly reminder");
    });

    it("should format Overdue reminder correctly with overdue days count", () => {
      const message = formatDebtorReminderMessage("OVERDUE", {
        customerName: "Ada Lovelace",
        businessName: "Acme Electronics",
        currency: "NGN",
        outstandingBalance: 75000,
        overdueDays: 5,
        dueDate: "2026-09-01",
      });

      expect(message).toContain("Dear Ada Lovelace");
      expect(message).toContain("5 days overdue");
      expect(message).toContain("₦75,000.00");
      expect(message).toContain("Acme Electronics");
    });

    it("should format Final Notice with urgent warning header and demand language", () => {
      const message = formatDebtorReminderMessage("FINAL_NOTICE", {
        customerName: "Ada Lovelace",
        businessName: "Acme Electronics",
        currency: "NGN",
        outstandingBalance: 75000,
        overdueDays: 14,
      });

      expect(message).toContain("URGENT: FINAL PAYMENT NOTICE");
      expect(message).toContain("Attention: *Ada Lovelace*");
      expect(message).toContain("₦75,000.00");
      expect(message).toContain("14 days overdue");
      expect(message).toContain("suspension of credit terms");
    });
  });

  describe("2. Date & WhatsApp URL Helpers", () => {
    it("should accurately calculate overdue days", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      expect(calculateOverdueDays(pastDate)).toBe(10);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      expect(calculateOverdueDays(futureDate)).toBe(0);

      expect(calculateOverdueDays(null)).toBe(0);
      expect(calculateOverdueDays(undefined)).toBe(0);
    });

    it("should construct WhatsApp click-to-chat URL with normalized phone and encoded text", () => {
      const url1 = buildWhatsAppClickToChatUrl("08012345678", "Hello Ada! Your balance is ₦75,000.00.");
      expect(url1).toBe("https://wa.me/2348012345678?text=Hello%20Ada!%20Your%20balance%20is%20%E2%82%A675%2C000.00.");

      const url2 = buildWhatsAppClickToChatUrl("+234 801 234 5678", "Payment Reminder");
      expect(url2).toBe("https://wa.me/2348012345678?text=Payment%20Reminder");

      const emptyUrl = buildWhatsAppClickToChatUrl("", "Test");
      expect(emptyUrl).toBe("");
    });
  });

  describe("3. Debtor Reminder Preview Server Action", () => {
    it("should return preview data with real database balance and items for debtor", async () => {
      const preview = await getDebtorReminderPreviewAction(
        primaryBusiness.id,
        testCustomerWithDebt.id
      );

      expect(preview.success).toBe(true);
      expect(preview.customer?.name).toBe("Ada Lovelace");
      expect(preview.totalOutstanding).toBe("75000.00");
      expect(preview.formattedOutstanding).toBe("₦75,000.00");
      expect(preview.isOverdue).toBe(true);
      expect(preview.overdueDays).toBeGreaterThanOrEqual(4);
      expect(preview.canSendWhatsApp).toBe(true);
      expect(preview.canSendEmail).toBe(true);
      expect(preview.clickToChatUrl).toContain("https://wa.me/2348012345678");
    });

    it("should preview specific credit sale when saleId is provided", async () => {
      const preview = await getDebtorReminderPreviewAction(
        primaryBusiness.id,
        testCustomerWithDebt.id,
        creditSaleId,
        "OVERDUE"
      );

      expect(preview.success).toBe(true);
      expect(preview.saleId).toBe(creditSaleId);
      expect(preview.totalOutstanding).toBe("75000.00");
      expect(preview.itemsSummary).toContain("Smart Keyboard Pro");
      expect(preview.message).toContain("75,000.00");
    });

    it("should reject preview when customer has zero debt", async () => {
      const preview = await getDebtorReminderPreviewAction(
        primaryBusiness.id,
        testCustomerNoDebt.id
      );

      expect(preview.error).toBeDefined();
      expect(preview.error).toContain("no outstanding debt");
    });

    it("should reject cross-tenant preview request for customer belonging to another business", async () => {
      const preview = await getDebtorReminderPreviewAction(
        primaryBusiness.id,
        secondaryCustomer.id
      );

      expect(preview.error).toBeDefined();
      expect(preview.error).toContain("Customer not found or access denied");
    });
  });

  describe("4. WhatsApp Reminder Action & Tenant Security", () => {
    it("should generate WhatsApp reminder payload and fallback click-to-chat URL for debtor", async () => {
      const result = await sendDebtorWhatsAppReminderAction(
        primaryBusiness.id,
        testCustomerWithDebt.id,
        null,
        "Custom follow up message for Ada"
      );

      expect(result.success).toBe(true);
      expect(result.clickToChatUrl).toContain("https://wa.me/2348012345678");
      expect(result.clickToChatUrl).toContain(encodeURIComponent("Custom follow up message for Ada"));
    });

    it("should reject WhatsApp reminder for customer with zero debt", async () => {
      const result = await sendDebtorWhatsAppReminderAction(
        primaryBusiness.id,
        testCustomerNoDebt.id
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain("no outstanding debt");
    });

    it("should reject WhatsApp reminder across tenants", async () => {
      const result = await sendDebtorWhatsAppReminderAction(
        primaryBusiness.id,
        secondaryCustomer.id
      );

      expect(result.error).toBeDefined();
    });
  });

  describe("5. Email Reminder Action & Email Validation", () => {
    it("should dispatch email reminder for customer with valid email and debt", async () => {
      const result = await sendDebtorEmailReminderAction(
        primaryBusiness.id,
        testCustomerWithDebt.id,
        creditSaleId,
        "Kindly note your payment is due.",
        "FRIENDLY"
      );

      expect(result.success).toBe(true);
      expect(result.dispatchedVia).toBe("EMAIL");
      expect(result.message).toContain(testCustomerWithDebt.email!);
    });

    it("should reject email reminder for customer with no debt", async () => {
      const result = await sendDebtorEmailReminderAction(
        primaryBusiness.id,
        testCustomerNoDebt.id
      );

      expect(result.error).toBeDefined();
      expect(result.error).toContain("no outstanding debt");
    });

    it("should reject email reminder across tenants", async () => {
      const result = await sendDebtorEmailReminderAction(
        primaryBusiness.id,
        secondaryCustomer.id
      );

      expect(result.error).toBeDefined();
    });
  });
});
