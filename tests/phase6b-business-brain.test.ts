import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  calculateBusinessHealth,
  calculateGrowthPercent,
  evaluateNeedsAttention,
  generateRecommendations,
  generateBusinessBrief,
} from "../src/lib/brain";
import { runAIAssistant } from "../src/lib/ai/executor";
import { getAIProvider } from "../src/lib/ai/provider";
import { BIZPILOT_AI_TOOLS } from "../src/lib/ai/tools";

describe("Phase 6B: BizPilot Business Brain Foundation", () => {
  let userA: { id: string; email: string };
  let businessA: { id: string; name: string; currency: string };
  let userB: { id: string; email: string };
  let businessB: { id: string; name: string; currency: string };

  let productA1: { id: string; name: string; sku: string };
  let productA2: { id: string; name: string; sku: string };
  let productA3Zero: { id: string; name: string; sku: string };
  let customerA1: { id: string; name: string };
  let customerA2: { id: string; name: string };

  beforeAll(async () => {
    const hashedPassword = await hashPassword("StrongPass123!");

    // Create Business A (NGN currency)
    userA = await prisma.user.create({
      data: {
        email: `brain_owner_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Adaeze Brain",
      },
    });

    businessA = await prisma.business.create({
      data: {
        name: "Adaeze Retail Ltd",
        slug: `adaeze-retail-${Date.now()}`,
        currency: "NGN",
        memberships: {
          create: {
            userId: userA.id,
            role: "OWNER",
          },
        },
      },
    });

    // Create Business B (USD currency - Multi-tenant isolation)
    userB = await prisma.user.create({
      data: {
        email: `brain_owner_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "John Tenant",
      },
    });

    businessB = await prisma.business.create({
      data: {
        name: "Apex Global USD",
        slug: `apex-global-${Date.now()}`,
        currency: "USD",
        memberships: {
          create: {
            userId: userB.id,
            role: "OWNER",
          },
        },
      },
    });

    // Seed Products for Business A
    productA1 = await prisma.product.create({
      data: {
        businessId: businessA.id,
        name: "Wireless Earbuds",
        sku: "EAR-001",
        costPrice: "10000.00",
        sellingPrice: "25000.00",
        stockQuantity: 15,
        lowStockThreshold: 5,
      },
    });

    productA2 = await prisma.product.create({
      data: {
        businessId: businessA.id,
        name: "Power Bank 20000mAh",
        sku: "PWR-002",
        costPrice: "8000.00",
        sellingPrice: "18000.00",
        stockQuantity: 2, // LOW STOCK (<= 5)
        lowStockThreshold: 5,
      },
    });

    productA3Zero = await prisma.product.create({
      data: {
        businessId: businessA.id,
        name: "Fast Charging Cable USB-C",
        sku: "CAB-003",
        costPrice: "1500.00",
        sellingPrice: "4000.00",
        stockQuantity: 0, // ZERO STOCK
        lowStockThreshold: 10,
      },
    });

    // Seed Customers for Business A
    customerA1 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Emeka Okoye",
        phone: "2348011223344",
        email: "emeka@okoye.test",
      },
    });

    customerA2 = await prisma.customer.create({
      data: {
        businessId: businessA.id,
        name: "Chioma Adeleke",
        phone: "2348099887766",
        email: "chioma@adeleke.test",
      },
    });

    const now = new Date();

    // Seed Completed Sales for Business A (Today & This Month)
    await prisma.sale.create({
      data: {
        businessId: businessA.id,
        customerId: customerA1.id,
        totalAmount: "50000.00",
        status: "COMPLETED",
        paymentMethod: "TRANSFER",
        createdAt: now,
        items: {
          create: {
            productId: productA1.id,
            quantity: 2,
            unitPrice: "25000.00",
            totalAmount: "50000.00",
          },
        },
      },
    });

    // Seed Expenses for Business A (Today & This Month)
    await prisma.expense.create({
      data: {
        businessId: businessA.id,
        amount: "15000.00",
        category: "Maintenance",
        description: "Generator Fuel & Servicing",
        createdAt: now,
      },
    });

    // Seed Invoices for Business A (1 Overdue, 1 Pending Draft)
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 5); // 5 days overdue

    await prisma.invoice.create({
      data: {
        businessId: businessA.id,
        customerId: customerA2.id,
        invoiceNumber: "INV-2026-001",
        subtotal: "36000.00",
        tax: "0.00",
        total: "36000.00",
        status: "SENT",
        dueDate: overdueDate,
        createdAt: overdueDate,
        items: {
          create: {
            productId: productA2.id,
            description: "Power Bank 20000mAh",
            quantity: 2,
            unitPrice: "18000.00",
            totalAmount: "36000.00",
          },
        },
      },
    });

    // Seed Business B Data (USD)
    await prisma.product.create({
      data: {
        businessId: businessB.id,
        name: "Cloud Server Pro",
        sku: "SRV-999",
        costPrice: "50.00",
        sellingPrice: "150.00",
        stockQuantity: 100,
        lowStockThreshold: 10,
      },
    });

    await prisma.sale.create({
      data: {
        businessId: businessB.id,
        totalAmount: "300.00",
        status: "COMPLETED",
        paymentMethod: "CARD",
        createdAt: now,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (businessA?.id) {
      await prisma.saleItem.deleteMany({ where: { sale: { businessId: businessA.id } } });
      await prisma.sale.deleteMany({ where: { businessId: businessA.id } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { businessId: businessA.id } } });
      await prisma.invoice.deleteMany({ where: { businessId: businessA.id } });
      await prisma.expense.deleteMany({ where: { businessId: businessA.id } });
      await prisma.product.deleteMany({ where: { businessId: businessA.id } });
      await prisma.customer.deleteMany({ where: { businessId: businessA.id } });
      await prisma.membership.deleteMany({ where: { businessId: businessA.id } });
      await prisma.business.deleteMany({ where: { id: businessA.id } });
    }
    if (businessB?.id) {
      await prisma.sale.deleteMany({ where: { businessId: businessB.id } });
      await prisma.product.deleteMany({ where: { businessId: businessB.id } });
      await prisma.membership.deleteMany({ where: { businessId: businessB.id } });
      await prisma.business.deleteMany({ where: { id: businessB.id } });
    }
    if (userA?.id) await prisma.user.deleteMany({ where: { id: userA.id } });
    if (userB?.id) await prisma.user.deleteMany({ where: { id: userB.id } });
  });

  // ── 1. Growth Helper Calculation ───────────────────────────────────────────
  describe("Growth Percentage Math", () => {
    it("should calculate positive and negative growth percentages deterministically", () => {
      expect(calculateGrowthPercent(150, 100)).toBe(50);
      expect(calculateGrowthPercent(80, 100)).toBe(-20);
      expect(calculateGrowthPercent(100, 100)).toBe(0);
      expect(calculateGrowthPercent(50, 0)).toBe(100);
      expect(calculateGrowthPercent(0, 0)).toBeNull();
    });
  });

  // ── 2. Business Health Engine ──────────────────────────────────────────────
  describe("Business Health Engine", () => {
    it("should calculate deterministic sales, expenses, profit, and invoice health for Business A", async () => {
      const health = await calculateBusinessHealth(businessA.id);

      expect(health.businessId).toBe(businessA.id);
      expect(health.businessName).toBe("Adaeze Retail Ltd");
      expect(health.currency).toBe("NGN");

      // Sales
      expect(health.sales.today.amount).toBe(50000);
      expect(health.sales.today.count).toBe(1);
      expect(health.sales.today.formatted).toContain("50,000.00");
      expect(health.sales.thisMonth.amount).toBe(50000);

      // Expenses
      expect(health.expenses.today.amount).toBe(15000);
      expect(health.expenses.today.formatted).toContain("15,000.00");
      expect(health.expenses.topCategories.length).toBeGreaterThan(0);
      expect(health.expenses.topCategories[0].category).toBe("Maintenance");

      // Profit & Margin
      expect(health.profit.revenue).toBe(50000);
      expect(health.profit.expenses).toBe(15000);
      expect(health.profit.estimatedNetProfit).toBe(35000);
      expect(health.profit.estimatedMarginPercent).toBe(70); // (35000 / 50000) * 100 = 70%

      // Inventory
      expect(health.inventory.totalProducts).toBe(3);
      expect(health.inventory.zeroStockCount).toBe(1);
      expect(health.inventory.lowStockCount).toBe(1);
      expect(health.inventory.zeroStockItems[0].name).toBe("Fast Charging Cable USB-C");
      expect(health.inventory.lowStockItems[0].name).toBe("Power Bank 20000mAh");

      // Invoices
      expect(health.invoices.unpaidCount).toBe(1);
      expect(health.invoices.overdueCount).toBe(1);
      expect(health.invoices.outstandingAmount).toBe(36000);
      expect(health.invoices.overdueInvoices[0].invoiceNumber).toBe("INV-2026-001");
      expect(health.invoices.overdueInvoices[0].customerName).toBe("Chioma Adeleke");
      expect(health.invoices.overdueInvoices[0].daysOverdue).toBeGreaterThanOrEqual(4);
    });

    it("should respect Business B currency and calculate separate metrics (USD)", async () => {
      const healthB = await calculateBusinessHealth(businessB.id);

      expect(healthB.businessId).toBe(businessB.id);
      expect(healthB.currency).toBe("USD");
      expect(healthB.sales.today.amount).toBe(300);
      expect(healthB.sales.today.formatted).toContain("$300.00");
      expect(healthB.inventory.totalProducts).toBe(1);
      expect(healthB.inventory.zeroStockCount).toBe(0);
    });
  });

  // ── 3. Needs Attention Engine ──────────────────────────────────────────────
  describe("Needs Attention Engine", () => {
    it("should flag zero stock (CRITICAL), low stock (HIGH), and overdue invoice (HIGH/CRITICAL)", async () => {
      const health = await calculateBusinessHealth(businessA.id);
      const attention = evaluateNeedsAttention(health);

      expect(attention.length).toBeGreaterThanOrEqual(3);

      const zeroStockAlert = attention.find((a) => a.type === "ZERO_STOCK");
      expect(zeroStockAlert).toBeDefined();
      expect(zeroStockAlert?.severity).toBe("CRITICAL");
      expect(zeroStockAlert?.title).toContain("Fast Charging Cable USB-C");
      expect(zeroStockAlert?.recommendedAction).toContain("Restock");

      const lowStockAlert = attention.find((a) => a.type === "LOW_STOCK");
      expect(lowStockAlert).toBeDefined();
      expect(lowStockAlert?.severity).toBe("HIGH");
      expect(lowStockAlert?.title).toContain("Power Bank 20000mAh");

      const overdueAlert = attention.find((a) => a.type === "OVERDUE_INVOICE");
      expect(overdueAlert).toBeDefined();
      expect(overdueAlert?.title).toContain("INV-2026-001");
      expect(overdueAlert?.recommendedAction).toContain("Chioma Adeleke");
    });
  });

  // ── 4. Recommendation Engine ───────────────────────────────────────────────
  describe("Business Recommendation Engine", () => {
    it("should generate grounded, actionable recommendations without inventing entities", async () => {
      const health = await calculateBusinessHealth(businessA.id);
      const attention = evaluateNeedsAttention(health);
      const recs = generateRecommendations(attention, health);

      expect(recs.length).toBeGreaterThan(0);

      const restockRec = recs.find((r) => r.category === "INVENTORY");
      expect(restockRec).toBeDefined();
      expect(restockRec?.action).toContain("Fast Charging Cable USB-C");

      const cashFlowRec = recs.find((r) => r.category === "CASH_FLOW");
      expect(cashFlowRec).toBeDefined();
      expect(cashFlowRec?.action).toContain("Chioma Adeleke");
      expect(cashFlowRec?.action).toContain("INV-2026-001");
    });
  });

  // ── 5. Business Brief Service ──────────────────────────────────────────────
  describe("Business Brief Service", () => {
    it("should combine health metrics, attention items, recommendations, and executive headline", async () => {
      const brief = await generateBusinessBrief(businessA.id);

      expect(brief.businessId).toBe(businessA.id);
      expect(brief.businessName).toBe("Adaeze Retail Ltd");
      expect(brief.headline).toContain("Action Required");
      expect(brief.health.sales.today.amount).toBe(50000);
      expect(brief.attention.length).toBeGreaterThan(0);
      expect(brief.recommendations.length).toBeGreaterThan(0);

      // Verify formatted executive summary string
      expect(brief.formattedSummary).toContain("BizPilot Business Brief for Adaeze Retail Ltd");
      expect(brief.formattedSummary).toContain("Financial Health Snapshot");
      expect(brief.formattedSummary).toContain("50,000.00");
      expect(brief.formattedSummary).toContain("Invoices & Receivables");
      expect(brief.formattedSummary).toContain("Needs Attention");
    });

    it("should enforce strict multi-tenant isolation between Business A and Business B", async () => {
      const briefA = await generateBusinessBrief(businessA.id);
      const briefB = await generateBusinessBrief(businessB.id);

      expect(briefA.health.currency).toBe("NGN");
      expect(briefB.health.currency).toBe("USD");
      expect(briefA.formattedSummary).not.toContain("Cloud Server Pro");
      expect(briefB.formattedSummary).not.toContain("Wireless Earbuds");
      expect(briefB.health.sales.today.amount).toBe(300);
    });
  });

  // ── 6. AI Copilot Integration ──────────────────────────────────────────────
  describe("AI Copilot & Business Brain Tool Execution", () => {
    it("should route 'What needs my attention?' to get_needs_attention", async () => {
      const provider = getAIProvider();
      const res = await provider.generateResponse(
        [{ id: "1", role: "user", content: "What needs my attention?", timestamp: new Date().toISOString() }],
        {
          userId: userA.id,
          businessId: businessA.id,
          businessName: businessA.name,
          currency: businessA.currency,
          role: "OWNER",
        },
        BIZPILOT_AI_TOOLS
      );

      expect(res.toolCalls).toBeDefined();
      expect(res.toolCalls?.[0].toolName).toBe("get_needs_attention");

      // Execute through full pipeline
      const execRes = await runAIAssistant([], "What needs my attention?", {
        userId: userA.id,
        businessId: businessA.id,
        businessName: businessA.name,
        currency: businessA.currency,
        role: "OWNER",
      });

      expect(execRes.message.content).toContain("Matters Requiring Attention");
      expect(execRes.message.content).toContain("Fast Charging Cable USB-C");
    });

    it("should route 'How is my business doing?' and 'What should I know today?' to get_business_brief", async () => {
      const questions = [
        "How is my business doing?",
        "What should I know about my business today?",
        "Give me a daily business brief",
      ];

      for (const q of questions) {
        const execRes = await runAIAssistant([], q, {
          userId: userA.id,
          businessId: businessA.id,
          businessName: businessA.name,
          currency: businessA.currency,
          role: "OWNER",
        });

        expect(execRes.toolResults?.[0].toolName).toBe("get_business_brief");
        expect(execRes.message.content).toContain("BizPilot Business Brief");
        expect(execRes.message.content).toContain("Financial Health Snapshot");
      }
    });

    it("should reject cross-tenant AI tampering when user from Business A attempts to query Business B", async () => {
      const res = await runAIAssistant([], "Give me a business brief", {
        userId: userA.id,
        businessId: businessB.id, // User A is NOT a member of Business B
        businessName: businessB.name,
        currency: businessB.currency,
        role: "OWNER",
      });

      expect(res.toolResults?.[0].success).toBe(false);
      expect(res.toolResults?.[0].error).toContain("You do not have access to this business");
    });
  });
});
