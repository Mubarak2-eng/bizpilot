import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { calculateMonthlySalesGrowthAnalysis } from "../src/lib/brain/sales-growth";
import { get_monthly_sales_growth_analysis } from "../src/lib/ai/tools";
import { parseProductIntent, LocalDeterministicAIProvider } from "../src/lib/ai/provider";
import { AuthenticatedAIContext } from "../src/lib/ai/types";
import { Role } from "../src/types/auth";

describe("Phase 6C: Monthly Sales Intelligence & Revenue Growth Advisor", () => {
  let primaryContext: AuthenticatedAIContext;
  let secondaryContext: AuthenticatedAIContext;
  let testBusinessId: string;
  let secondaryBizId: string;
  let createdProductIds: string[] = [];
  let createdCustomerIds: string[] = [];
  let createdSaleIds: string[] = [];

  beforeAll(async () => {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `test-growth-${Date.now()}@bizpilot.test`,
          name: "Growth Test User",
        },
      });
    }

    let biz1 = await prisma.business.create({
      data: {
        name: `Acme Retailers ${Date.now()}`,
        slug: `acme-retailers-${Date.now()}`,
        currency: "NGN",
      },
    });
    testBusinessId = biz1.id;

    let biz2 = await prisma.business.create({
      data: {
        name: `Beta Supermarket ${Date.now()}`,
        slug: `beta-supermarket-${Date.now()}`,
        currency: "NGN",
      },
    });
    secondaryBizId = biz2.id;

    // Memberships
    await prisma.membership.create({
      data: {
        userId: user.id,
        businessId: biz1.id,
        role: Role.OWNER,
      },
    });

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

    // Seed test products: 1 Fast Seller, 1 Dead Stock item
    const fastProd = await prisma.product.create({
      data: {
        businessId: testBusinessId,
        name: "Wireless Earbuds Pro",
        sku: `WEB-${Date.now()}`,
        sellingPrice: "20000.00",
        costPrice: "12000.00",
        stockQuantity: 40,
        lowStockThreshold: 5,
      },
    });
    createdProductIds.push(fastProd.id);

    const deadProd = await prisma.product.create({
      data: {
        businessId: testBusinessId,
        name: "Vintage Screen Protectors Pack",
        sku: `VSP-${Date.now()}`,
        sellingPrice: "5000.00",
        costPrice: "2500.00",
        stockQuantity: 30, // 30 * 2500 = 75,000 locked capital
        lowStockThreshold: 5,
      },
    });
    createdProductIds.push(deadProd.id);

    // Seed test customer
    const customer = await prisma.customer.create({
      data: {
        businessId: testBusinessId,
        name: "Emeka Okafor",
        phone: "08011223344",
        email: "emeka.okafor@test.ng",
      },
    });
    createdCustomerIds.push(customer.id);

    // Seed completed sale for fast seller
    const sale1 = await prisma.sale.create({
      data: {
        businessId: testBusinessId,
        customerId: customer.id,
        totalAmount: "40000.00",
        paymentMethod: "TRANSFER",
        status: "COMPLETED",
        items: {
          create: [
            {
              productId: fastProd.id,
              quantity: 2,
              unitPrice: "20000.00",
              totalAmount: "40000.00",
            },
          ],
        },
      },
    });
    createdSaleIds.push(sale1.id);
  });

  afterAll(async () => {
    if (createdSaleIds.length > 0) {
      await prisma.saleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    }
    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await prisma.membership.deleteMany({ where: { businessId: { in: [testBusinessId, secondaryBizId] } } });
    await prisma.business.deleteMany({ where: { id: { in: [testBusinessId, secondaryBizId] } } });
    await prisma.$disconnect();
  });

  describe("1. Core Growth Engine Calculations", () => {
    it("should compute monthly revenue, order count, and AOV correctly", async () => {
      const report = await calculateMonthlySalesGrowthAnalysis(testBusinessId);

      expect(report.businessId).toBe(testBusinessId);
      expect(report.metrics.currentMonthRevenue).toBe(40000);
      expect(report.metrics.currentMonthOrderCount).toBe(1);
      expect(report.metrics.currentMonthAOV).toBe(40000);
      expect(report.metrics.currentMonthAOVFormatted).toMatch(/[₦$£€]/);
    });

    it("should identify star products and dead stock with locked capital", async () => {
      const report = await calculateMonthlySalesGrowthAnalysis(testBusinessId);

      expect(report.topPerformers.length).toBeGreaterThan(0);
      expect(report.topPerformers[0].name).toBe("Wireless Earbuds Pro");
      expect(report.topPerformers[0].unitsSold).toBe(2);

      expect(report.deadStock.length).toBeGreaterThan(0);
      expect(report.deadStock[0].name).toBe("Vintage Screen Protectors Pack");
      expect(report.deadStock[0].lockedCapital).toBe(75000); // 30 * 2500
      expect(report.totalLockedCapitalInDeadStock).toBeGreaterThanOrEqual(75000);
    });

    it("should generate 5 grounded, tailored growth playbooks", async () => {
      const report = await calculateMonthlySalesGrowthAnalysis(testBusinessId);

      expect(report.growthPlaybooks.length).toBe(5);
      const pillars = report.growthPlaybooks.map((p) => p.pillar);
      expect(pillars).toContain("AOV_EXPANSION");
      expect(pillars).toContain("PRODUCT_BUNDLING");
      expect(pillars).toContain("CUSTOMER_RETENTION");
      expect(pillars).toContain("PEAK_TIMING");

      // Verify product bundling specifically pairs star with dead stock
      const bundlePlaybook = report.growthPlaybooks.find((p) => p.pillar === "PRODUCT_BUNDLING");
      expect(bundlePlaybook?.title).toContain("Wireless Earbuds Pro");
      expect(bundlePlaybook?.title).toContain("Vintage Screen Protectors Pack");

      // Verify executive summary formatting
      expect(report.formattedSummary).toContain("Monthly Sales Intelligence & Revenue Growth Report");
      expect(report.formattedSummary).toContain("Five Actionable Strategies to Increase Your Sales");
    });
  });

  describe("2. AI Tool Execution & Multi-Tenant Security", () => {
    it("should execute get_monthly_sales_growth_analysis securely for primary business", async () => {
      const result = await get_monthly_sales_growth_analysis(
        { datePhrase: "this_month" },
        primaryContext
      );

      expect(result.success).toBe(true);
      expect(result.data.businessId).toBe(testBusinessId);
      expect(result.formatted).toContain("Monthly Sales Intelligence");
    });

    it("should reject execution if user lacks business access", async () => {
      const unauthorizedContext: AuthenticatedAIContext = {
        userId: "non-existent-user-id",
        businessId: testBusinessId,
        businessName: "Unauthorized",
        currency: "NGN",
        role: Role.MEMBER,
      };

      await expect(
        get_monthly_sales_growth_analysis({ datePhrase: "this_month" }, unauthorizedContext)
      ).rejects.toThrow();
    });
  });

  describe("3. Natural Language Intent Routing", () => {
    const provider = new LocalDeterministicAIProvider();

    it("should route 'how can I increase sales this month' to get_monthly_sales_growth_analysis", async () => {
      const response = await provider.generateResponse(
        [{ id: "1", role: "user", content: "How can I increase sales this month?", timestamp: "" }],
        primaryContext
      );

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0].toolName).toBe("get_monthly_sales_growth_analysis");
    });

    it("should route 'ways to increase sells' to get_monthly_sales_growth_analysis", async () => {
      const response = await provider.generateResponse(
        [{ id: "2", role: "user", content: "give me ways to increase sells", timestamp: "" }],
        primaryContext
      );

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0].toolName).toBe("get_monthly_sales_growth_analysis");
    });

    it("should route 'analyze sales in a month' to get_monthly_sales_growth_analysis", async () => {
      const response = await provider.generateResponse(
        [{ id: "3", role: "user", content: "analyze my sales in a month", timestamp: "" }],
        primaryContext
      );

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.[0].toolName).toBe("get_monthly_sales_growth_analysis");
    });
  });
});
