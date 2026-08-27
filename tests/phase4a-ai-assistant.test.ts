import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { AuthenticatedAIContext } from "../src/lib/ai/types";
import {
  get_business_summary,
  get_sales,
  get_top_products,
  get_low_stock_products,
  get_customers,
  get_customer_summary,
  get_expenses,
  get_invoices,
  get_product,
} from "../src/lib/ai/tools";
import { resolveDateRange } from "../src/lib/ai/date-utils";
import { executeToolCall, runAIAssistant } from "../src/lib/ai/executor";
import { Role } from "../src/types/auth";

describe("Phase 4A: BizPilot AI Business Assistant & Read-Only Tools", () => {
  let primaryContext: AuthenticatedAIContext;
  let secondaryContext: AuthenticatedAIContext;
  let sampleCustomer: { id: string; name: string };
  let sampleProduct: { id: string; name: string; sku: string };

  beforeAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!user || !biz1 || !biz2) {
      throw new Error("Seeded test data missing for AI assistant tests!");
    }

    primaryContext = {
      userId: user.id,
      businessId: biz1.id,
      businessName: biz1.name,
      currency: biz1.currency,
      role: Role.OWNER,
    };

    secondaryContext = {
      userId: user.id,
      businessId: biz2.id,
      businessName: biz2.name,
      currency: biz2.currency,
      role: Role.OWNER,
    };

    const cust = await prisma.customer.findFirst({ where: { businessId: biz1.id } });
    if (!cust) throw new Error("Customer missing for Acme Electronics!");
    sampleCustomer = { id: cust.id, name: cust.name };

    const prod = await prisma.product.findFirst({ where: { businessId: biz1.id } });
    if (!prod) throw new Error("Product missing for Acme Electronics!");
    sampleProduct = { id: prod.id, name: prod.name, sku: prod.sku };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Date-Utils & Natural Date Phrase Resolution", () => {
    it("should resolve today, yesterday, and month ranges accurately", () => {
      const fixedRef = new Date("2026-08-21T12:00:00Z");

      const today = resolveDateRange("today", null, null, fixedRef);
      expect(today.startDate).toBeDefined();
      expect(today.endDate).toBeDefined();
      expect(today.startDate?.getDate()).toBe(21);

      const yesterday = resolveDateRange("yesterday", null, null, fixedRef);
      expect(yesterday.startDate?.getDate()).toBe(20);

      const thisMonth = resolveDateRange("this_month", null, null, fixedRef);
      expect(thisMonth.startDate?.getDate()).toBe(1);
      expect(thisMonth.startDate?.getMonth()).toBe(7); // August (0-indexed)
    });
  });

  describe("2. get_business_summary Tool", () => {
    it("should calculate business KPIs scoped to active tenant", async () => {
      const summary = await get_business_summary({}, primaryContext);

      expect(summary.businessName).toBe(primaryContext.businessName);
      expect(summary.currency).toBe(primaryContext.currency);
      expect(typeof summary.salesToday.amount).toBe("number");
      expect(typeof summary.salesThisMonth.amount).toBe("number");
      expect(typeof summary.totalExpensesAllTime.amount).toBe("number");
      expect(typeof summary.inventorySummary.totalProducts).toBe("number");
      expect(summary.inventorySummary.totalProducts).toBeGreaterThan(0);
      expect(summary.customerCount).toBeGreaterThan(0);
    });
  });

  describe("3. get_sales Tool", () => {
    it("should retrieve sales history and enforce limit bounds", async () => {
      const result = await get_sales({ datePhrase: "this_month", limit: 5 }, primaryContext);

      expect(result.limit).toBe(5);
      expect(Array.isArray(result.sales)).toBe(true);
      if (result.sales.length > 0) {
        expect(result.sales[0].formattedAmount).toMatch(/[₦$£€]/);
        expect(typeof result.sales[0].totalAmount).toBe("number");
      }
    });

    it("should filter sales by customer name", async () => {
      const result = await get_sales({ customerName: sampleCustomer.name }, primaryContext);
      expect(result.sales.every((s) => s.customer.toLowerCase().includes(sampleCustomer.name.toLowerCase()))).toBe(true);
    });
  });

  describe("4. get_top_products Tool", () => {
    it("should rank products by quantity sold and revenue", async () => {
      const result = await get_top_products({ limit: 3 }, primaryContext);

      expect(result.topProductsCount).toBeLessThanOrEqual(3);
      expect(Array.isArray(result.topProducts)).toBe(true);
      if (result.topProducts.length >= 2) {
        expect(result.topProducts[0].unitsSold).toBeGreaterThanOrEqual(result.topProducts[1].unitsSold);
      }
    });
  });

  describe("5. get_low_stock_products Tool", () => {
    it("should return only products where stock is at or below threshold", async () => {
      const result = await get_low_stock_products({ limit: 10 }, primaryContext);

      expect(Array.isArray(result.lowStockProducts)).toBe(true);
      result.lowStockProducts.forEach((p) => {
        expect(p.stockQuantity).toBeLessThanOrEqual(p.lowStockThreshold);
      });
    });
  });

  describe("6. get_customers & get_customer_summary Tools", () => {
    it("should search and list customers with spend metrics", async () => {
      const result = await get_customers({ search: sampleCustomer.name }, primaryContext);

      expect(result.totalCustomers).toBeGreaterThanOrEqual(1);
      expect(result.customers.some((c) => c.name === sampleCustomer.name)).toBe(true);
    });

    it("should retrieve comprehensive customer summary by name", async () => {
      const result = await get_customer_summary({ customerName: sampleCustomer.name }, primaryContext);

      if ("customer" in result && result.customer) {
        expect(result.customer.name).toBe(sampleCustomer.name);
        expect(typeof result.lifetimeSalesAmount).toBe("number");
        expect(Array.isArray(result.recentTransactions)).toBe(true);
      } else {
        throw new Error("Expected customer summary object");
      }
    });
  });

  describe("7. get_expenses & get_invoices Tools", () => {
    it("should return categorized expenses and category breakdowns", async () => {
      const result = await get_expenses({ datePhrase: "this_month" }, primaryContext);

      expect(typeof result.totalSpent).toBe("number");
      expect(Array.isArray(result.categoryBreakdown)).toBe(true);
      expect(Array.isArray(result.expenses)).toBe(true);
    });

    it("should return invoices and outstanding receivables", async () => {
      const result = await get_invoices({ limit: 10 }, primaryContext);

      expect(typeof result.totalAmount).toBe("number");
      expect(typeof result.unpaidAmount).toBe("number");
      expect(Array.isArray(result.invoices)).toBe(true);
    });
  });

  describe("8. get_product Tool", () => {
    it("should find product by SKU and return current stock and pricing", async () => {
      const result = await get_product({ sku: sampleProduct.sku }, primaryContext);

      if ("sku" in result) {
        expect(result.sku).toBe(sampleProduct.sku);
        expect(result.name).toBe(sampleProduct.name);
        expect(typeof result.stockQuantity).toBe("number");
        expect(typeof result.sellingPrice).toBe("number");
      } else {
        throw new Error("Expected product object");
      }
    });
  });

  describe("9. Multi-Tenant AI Isolation & Parameter Tampering Protection", () => {
    it("should NOT return Business A records when queried with Business B context", async () => {
      // In Beta Retailers (secondaryContext), no sales have been recorded
      const betaSales = await get_sales({}, secondaryContext);
      expect(betaSales.totalRecords).toBe(0);

      // Business summary in Beta Retailers shows 0 sales and 0 expenses
      const betaSummary = await get_business_summary({}, secondaryContext);
      expect(betaSummary.salesToday.amount).toBe(0);
      expect(betaSummary.totalSalesAllTime.amount).toBe(0);
      expect(betaSummary.totalExpensesAllTime.amount).toBe(0);
    });

    it("should ignore client-supplied businessId and enforce server context in executeToolCall", async () => {
      // Attacker tries to pass primaryContext.businessId in rawParams while executing under secondaryContext
      const maliciousParams = {
        businessId: primaryContext.businessId, // Attempted spoof
      };

      const result = await executeToolCall("get_sales", maliciousParams, secondaryContext, "test-tamper-req");

      expect(result.success).toBe(true);
      const data = result.data as { totalRecords: number };
      // Result must remain scoped to secondaryContext (Beta Retailers: 0 sales)
      expect(data.totalRecords).toBe(0);
    });
  });

  describe("10. End-to-End AI Assistant Pipeline & Safe Error Handling", () => {
    it("should execute natural language questions and return synthesized copilot response", async () => {
      const response = await runAIAssistant(
        [],
        "What were my sales today and which products are low on stock?",
        primaryContext
      );

      expect(response.message.role).toBe("assistant");
      expect(response.message.content.length).toBeGreaterThan(10);
      expect(response.requestId).toBeDefined();
      expect(response.providerUsed).toBeDefined();
    });

    it("should reject unauthorized user attempting to query a business they do not belong to", async () => {
      const unauthorizedContext: AuthenticatedAIContext = {
        userId: "fake-user-999999",
        businessId: primaryContext.businessId,
        businessName: primaryContext.businessName,
        currency: primaryContext.currency,
        role: Role.MEMBER,
      };

      const toolRes = await executeToolCall("get_business_summary", {}, unauthorizedContext, "unauth-test");
      expect(toolRes.success).toBe(false);
      expect(toolRes.error).toContain("access");
    });
  });
});
