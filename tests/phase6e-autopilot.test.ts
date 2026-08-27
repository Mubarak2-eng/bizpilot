import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import {
  evaluateBusinessAutopilot,
  detectAutopilotEvents,
  detectBusinessOpportunities,
  buildDailyActionPlan,
  generateMorningBrief,
  sendMorningBriefToWhatsApp,
  sendCriticalAlertToWhatsApp,
} from "../src/lib/autopilot";
import { calculateBusinessHealth } from "../src/lib/brain";
import { runAIAssistant } from "../src/lib/ai/executor";
import { handleIncomingWhatsAppMessage } from "../src/lib/whatsapp/handler";

describe("Phase 6E: BizPilot Business Autopilot", () => {
  let userOwnerA: { id: string; email: string };
  let userOwnerB: { id: string; email: string };
  let bizA: { id: string; name: string; currency: string };
  let bizB: { id: string; name: string; currency: string };

  const verifiedPhoneA = "2348099990001";
  const unverifiedPhoneB = "2348099990002";

  beforeAll(async () => {
    const hashedPassword = await hashPassword("StrongPass123!");

    userOwnerA = await prisma.user.create({
      data: {
        email: `auto_owner_a_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Autopilot Owner A",
      },
    });

    userOwnerB = await prisma.user.create({
      data: {
        email: `auto_owner_b_${Date.now()}@bizpilot.test`,
        password: hashedPassword,
        name: "Autopilot Owner B",
      },
    });

    bizA = await prisma.business.create({
      data: {
        name: "Apex Electronics Hub",
        slug: `apex-elec-${Date.now()}`,
        businessType: "ELECTRONICS",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerA.id, role: "OWNER" }],
        },
      },
    });

    bizB = await prisma.business.create({
      data: {
        name: "Zenith Grocers",
        slug: `zenith-groc-${Date.now()}`,
        businessType: "SUPERMARKET",
        currency: "NGN",
        memberships: {
          create: [{ userId: userOwnerB.id, role: "OWNER" }],
        },
      },
    });

    // Link verified WhatsApp for Biz A
    await prisma.whatsAppConnection.create({
      data: {
        businessId: bizA.id,
        userId: userOwnerA.id,
        phoneNumber: verifiedPhoneA,
        verified: true,
      },
    });

    // Link unverified WhatsApp for Biz B
    await prisma.whatsAppConnection.create({
      data: {
        businessId: bizB.id,
        userId: userOwnerB.id,
        phoneNumber: unverifiedPhoneB,
        verified: false,
      },
    });

    // Seed Biz A Data:
    // Product 1: Best-Seller (Out of stock)
    const prodBestSeller = await prisma.product.create({
      data: {
        businessId: bizA.id,
        name: "iPhone 15 Pro Max 256GB",
        sku: "IPHONE-15P-256",
        costPrice: "1100000.00",
        sellingPrice: "1400000.00",
        stockQuantity: 0, // 0 Stock
        lowStockThreshold: 5,
      },
    });

    // Product 2: Low Stock
    const prodLowStock = await prisma.product.create({
      data: {
        businessId: bizA.id,
        name: "MagSafe Wireless Charger",
        sku: "MAG-CHG-01",
        costPrice: "15000.00",
        sellingPrice: "28000.00",
        stockQuantity: 2, // Low stock (<= 10)
        lowStockThreshold: 10,
      },
    });

    // Customer: VIP Repeat Buyer
    const vipCustomer = await prisma.customer.create({
      data: {
        businessId: bizA.id,
        name: "Emeka Enterprises Ltd",
        email: "emeka@enterprises.ng",
      },
    });

    // Sale 1: Completed sale for best seller
    await prisma.sale.create({
      data: {
        businessId: bizA.id,
        customerId: vipCustomer.id,
        totalAmount: "4200000.00",
        status: "COMPLETED",
        paymentMethod: "TRANSFER",
        items: {
          create: {
            productId: prodBestSeller.id,
            quantity: 3,
            unitPrice: "1400000.00",
            totalAmount: "4200000.00",
          },
        },
      },
    });

    // Sale 2: Second completed sale (Repeat client)
    await prisma.sale.create({
      data: {
        businessId: bizA.id,
        customerId: vipCustomer.id,
        totalAmount: "84000.00",
        status: "COMPLETED",
        paymentMethod: "CARD",
        items: {
          create: {
            productId: prodLowStock.id,
            quantity: 3,
            unitPrice: "28000.00",
            totalAmount: "84000.00",
          },
        },
      },
    });

    // Overdue Invoice
    await prisma.invoice.create({
      data: {
        businessId: bizA.id,
        customerId: vipCustomer.id,
        invoiceNumber: "INV-1042",
        status: "OVERDUE",
        subtotal: "185000.00",
        tax: "0.00",
        total: "185000.00",
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      },
    });

    // Expense Spike
    await prisma.expense.create({
      data: {
        businessId: bizA.id,
        category: "Showroom Rent & Power",
        amount: "500000.00",
        description: "Diesel & Commercial Rent",
      },
    });
  });

  afterAll(async () => {
    const bizIds = [bizA?.id, bizB?.id].filter(Boolean);

    for (const bId of bizIds) {
      await prisma.payment.deleteMany({ where: { businessId: bId } });
      await prisma.aIUsage.deleteMany({ where: { businessId: bId } });
      await prisma.businessGoal.deleteMany({ where: { businessId: bId } });
      await prisma.subscription.deleteMany({ where: { businessId: bId } });
      await prisma.saleItem.deleteMany({ where: { sale: { businessId: bId } } });
      await prisma.sale.deleteMany({ where: { businessId: bId } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { businessId: bId } } });
      await prisma.invoice.deleteMany({ where: { businessId: bId } });
      await prisma.expense.deleteMany({ where: { businessId: bId } });
      await prisma.product.deleteMany({ where: { businessId: bId } });
      await prisma.customer.deleteMany({ where: { businessId: bId } });
      await prisma.whatsAppConnection.deleteMany({ where: { businessId: bId } });
      await prisma.membership.deleteMany({ where: { businessId: bId } });
      await prisma.business.deleteMany({ where: { id: bId } });
    }

    if (userOwnerA?.id) await prisma.user.deleteMany({ where: { id: userOwnerA.id } });
    if (userOwnerB?.id) await prisma.user.deleteMany({ where: { id: userOwnerB.id } });
  });

  // ── 1. Deterministic Event Detection & Priorities ──────────────────────────
  describe("Autopilot Event Detector", () => {
    it("should detect TOP_PRODUCT_STOCKOUT with CRITICAL priority and exact evidence", async () => {
      const health = await calculateBusinessHealth(bizA.id);
      const events = detectAutopilotEvents(health);

      const topStockout = events.find((e) => e.type === "TOP_PRODUCT_STOCKOUT");
      expect(topStockout).toBeDefined();
      expect(topStockout?.severity).toBe("CRITICAL");
      expect(topStockout?.title).toContain("iPhone 15 Pro Max");
      expect(topStockout?.recommendedAction).toContain("immediate restock order");
      expect(topStockout?.dedupKey).toContain(bizA.id);
    });

    it("should detect OVERDUE_INVOICE with exact uncollected amounts", async () => {
      const health = await calculateBusinessHealth(bizA.id);
      const events = detectAutopilotEvents(health);

      const overdueEv = events.find((e) => e.type === "OVERDUE_INVOICE");
      expect(overdueEv).toBeDefined();
      expect(overdueEv?.severity).toMatch(/CRITICAL|HIGH/);
      expect(overdueEv?.explanation).toContain("1 customer invoice(s)");
      expect(overdueEv?.title).toContain("185,000");
    });

    it("should detect LOW_STOCK warnings for products at/below threshold", async () => {
      const health = await calculateBusinessHealth(bizA.id);
      const events = detectAutopilotEvents(health);

      const lowStockEv = events.find((e) => e.type === "LOW_STOCK");
      expect(lowStockEv).toBeDefined();
      expect(lowStockEv?.title).toContain("MagSafe Wireless Charger");
      expect(lowStockEv?.severity).toBe("MEDIUM");
    });
  });

  // ── 2. Grounded Commercial Opportunities ───────────────────────────────────
  describe("Autopilot Opportunity Engine", () => {
    it("should detect product expansion and VIP customer retention opportunities", async () => {
      const health = await calculateBusinessHealth(bizA.id);
      const opportunities = detectBusinessOpportunities(health);

      expect(opportunities.length).toBeGreaterThan(0);

      // Best-seller demand
      const prodOpp = opportunities.find((o) => o.category === "PRODUCT_EXPANSION");
      expect(prodOpp).toBeDefined();
      expect(prodOpp?.title).toContain("iPhone 15 Pro Max");

      // VIP Customer
      const custOpp = opportunities.find((o) => o.category === "CUSTOMER_EXPANSION");
      expect(custOpp).toBeDefined();
      expect(custOpp?.title).toContain("Emeka Enterprises");
      expect(custOpp?.evidence).toContain("2 repeat orders");
    });
  });

  // ── 3. Daily Action Plan & Morning Brief ───────────────────────────────────
  describe("Daily Action Plan & Executive Morning Brief", () => {
    it("should generate a prioritized Daily Action Plan with max 5 items and visual badges", async () => {
      const autopilot = await evaluateBusinessAutopilot(bizA.id);
      const plan = autopilot.actionPlan;

      expect(plan.totalActions).toBeGreaterThan(0);
      expect(plan.totalActions).toBeLessThanOrEqual(5);

      // Highest priority item should be CRITICAL
      expect(plan.actions[0].badge).toBe("🔴");
      expect(plan.actions[0].severity).toBe("CRITICAL");

      // Formatted summary includes action plan header
      expect(plan.formattedSummary).toContain("TODAY'S BIZPILOT ACTION PLAN");
      expect(plan.formattedSummary).toContain("Apex Electronics Hub");
    });

    it("should generate an African SME executive Morning Briefing", async () => {
      const autopilot = await evaluateBusinessAutopilot(bizA.id);
      const brief = autopilot.morningBrief;

      expect(brief.formattedMessage).toContain("GOOD MORNING — BIZPILOT");
      expect(brief.formattedMessage).toContain("THREE THINGS TO KNOW");
      expect(brief.formattedMessage).toContain("TODAY'S PRIORITIES");
      expect(brief.threeThingsToKnow.length).toBe(3);
      expect(brief.todayPriorities.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 4. Outbound WhatsApp Delivery (Verified Only) ──────────────────────────
  describe("Outbound WhatsApp Autopilot Delivery", () => {
    it("should successfully dispatch Morning Brief to verified WhatsApp connection", async () => {
      const oldToken = process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_ACCESS_TOKEN;

      const result = await sendMorningBriefToWhatsApp(bizA.id);

      expect(result.success).toBe(true);
      expect(result.phoneNumber).toBe(verifiedPhoneA);
      expect(result.simulated).toBe(true);

      process.env.WHATSAPP_ACCESS_TOKEN = oldToken;
    });

    it("should refuse dispatching Morning Brief to unverified WhatsApp connection", async () => {
      const result = await sendMorningBriefToWhatsApp(bizB.id);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("NO_VERIFIED_WHATSAPP_CONNECTION");
    });

    it("should dispatch critical alert to verified WhatsApp connection", async () => {
      const oldToken = process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_ACCESS_TOKEN;

      const result = await sendCriticalAlertToWhatsApp(
        bizA.id,
        "Critical Stockout: iPhone 15 Pro Max",
        "0 units left on shelves.",
        "Restock immediately."
      );

      expect(result.success).toBe(true);
      expect(result.phoneNumber).toBe(verifiedPhoneA);
      expect(result.simulated).toBe(true);

      process.env.WHATSAPP_ACCESS_TOKEN = oldToken;
    });
  });

  // ── 5. AI Copilot Natural Language Routing ─────────────────────────────────
  describe("AI Assistant Autopilot Routing", () => {
    it("should route 'What should I do today?' to get_daily_action_plan", async () => {
      const res = await runAIAssistant([], "What should I do today?", {
        userId: userOwnerA.id,
        businessId: bizA.id,
        businessName: bizA.name,
        currency: bizA.currency,
        role: "OWNER",
      });

      expect(res.toolResults?.[0].toolName).toBe("get_daily_action_plan");
      expect(res.message.content).toContain("TODAY'S BIZPILOT ACTION PLAN");
      expect(res.message.content).toContain("iPhone 15 Pro Max");
    });

    it("should route 'Give me my morning brief' to get_morning_brief", async () => {
      const res = await runAIAssistant([], "Give me my morning brief", {
        userId: userOwnerA.id,
        businessId: bizA.id,
        businessName: bizA.name,
        currency: bizA.currency,
        role: "OWNER",
      });

      expect(res.toolResults?.[0].toolName).toBe("get_morning_brief");
      expect(res.message.content).toContain("GOOD MORNING — BIZPILOT");
    });

    it("should answer Autopilot action plan queries over WhatsApp", async () => {
      const waRes = await handleIncomingWhatsAppMessage(
        verifiedPhoneA,
        "What should I do today?",
        `msg_auto_${Date.now()}`
      );

      expect(waRes.success).toBe(true);
      expect(waRes.replySent).toContain("TODAY'S BIZPILOT ACTION PLAN");
    });
  });

  // ── 6. Multi-Tenant Isolation ──────────────────────────────────────────────
  describe("Autopilot Multi-Tenant Security", () => {
    it("should completely isolate events between different businesses", async () => {
      const autoA = await evaluateBusinessAutopilot(bizA.id);
      const autoB = await evaluateBusinessAutopilot(bizB.id);

      expect(autoA.businessId).toBe(bizA.id);
      expect(autoB.businessId).toBe(bizB.id);
      expect(autoA.events).not.toEqual(autoB.events);
    });
  });
});
