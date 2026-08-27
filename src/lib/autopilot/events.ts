import { BusinessHealthMetrics } from "../brain/types";
import { IndustryInsight } from "../brain/industry";
import { AutopilotEvent, AutopilotSeverity } from "./types";

/**
 * Generates a stable deduplication key for an event.
 */
function buildDedupKey(
  businessId: string,
  type: string,
  entityId: string,
  date = new Date()
): string {
  const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return `${businessId}:${type}:${entityId}:${dayKey}`;
}

/**
 * Detects all deterministic operational events and issues from verified business metrics.
 * Uses strict deterministic criteria with zero LLM hallucination.
 */
export function detectAutopilotEvents(
  health: BusinessHealthMetrics,
  industryInsights: IndustryInsight[] = [],
  referenceDate = new Date()
): AutopilotEvent[] {
  const events: AutopilotEvent[] = [];
  const businessId = health.businessId;
  const nowIso = referenceDate.toISOString();
  const expiresAt = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 1. TOP PRODUCT STOCKOUT (CRITICAL)
  if (health.inventory.topSellingProducts.length > 0) {
    const topProd = health.inventory.topSellingProducts[0];
    const isZero = health.inventory.zeroStockItems.some((p) => p.id === topProd.id);
    if (isZero) {
      events.push({
        id: `auto-ev-topzero-${topProd.id}`,
        businessId,
        type: "TOP_PRODUCT_STOCKOUT",
        severity: "CRITICAL",
        title: `Critical Stockout: Best-Seller "${topProd.name}" is Completely Depleted`,
        explanation: `Your #1 revenue generating product "${topProd.name}" (${topProd.revenueFormatted} this month) has 0 units in stock. Every customer looking for this item will result in direct revenue loss.`,
        evidence: {
          productId: topProd.id,
          productName: topProd.name,
          revenueGenerated: topProd.revenueFormatted,
          unitsSold: topProd.unitsSold,
          stockQuantity: 0,
        },
        recommendedAction: `Execute an immediate restock order for "${topProd.name}" before the next trading cycle.`,
        dedupKey: buildDedupKey(businessId, "TOP_PRODUCT_STOCKOUT", topProd.id, referenceDate),
        createdAt: nowIso,
        expiresAt,
      });
    }
  }

  // 2. ZERO STOCK PRODUCTS (HIGH)
  for (const zeroProd of health.inventory.zeroStockItems.slice(0, 3)) {
    // Skip if already flagged as top product
    if (health.inventory.topSellingProducts[0]?.id === zeroProd.id) continue;

    events.push({
      id: `auto-ev-zero-${zeroProd.id}`,
      businessId,
      type: "ZERO_STOCK",
      severity: "HIGH",
      title: `Stock Depleted: "${zeroProd.name}" is at 0 units`,
      explanation: `Product "${zeroProd.name}" is completely out of stock on your shelves.`,
      evidence: {
        productId: zeroProd.id,
        productName: zeroProd.name,
        stockQuantity: 0,
      },
      recommendedAction: `Replenish inventory for "${zeroProd.name}" to prevent lost sales.`,
      dedupKey: buildDedupKey(businessId, "ZERO_STOCK", zeroProd.id, referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 3. LOW STOCK WARNINGS (MEDIUM)
  for (const lowProd of health.inventory.lowStockItems.slice(0, 3)) {
    events.push({
      id: `auto-ev-low-${lowProd.id}`,
      businessId,
      type: "LOW_STOCK",
      severity: "MEDIUM",
      title: `Low Stock Alert: "${lowProd.name}" (${lowProd.stockQuantity} units left)`,
      explanation: `"${lowProd.name}" is at or below its safety threshold (${lowProd.lowStockThreshold} units).`,
      evidence: {
        productId: lowProd.id,
        productName: lowProd.name,
        stockQuantity: lowProd.stockQuantity,
        threshold: lowProd.lowStockThreshold,
      },
      recommendedAction: `Place a supplier reorder for "${lowProd.name}" to maintain buffer.`,
      dedupKey: buildDedupKey(businessId, "LOW_STOCK", lowProd.id, referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 4. OVERDUE INVOICES (CRITICAL / HIGH)
  if (health.invoices.overdueCount > 0) {
    const overdueTotal = health.invoices.overdueInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const overdueFormatted =
      health.invoices.overdueInvoices[0]?.totalFormatted || health.invoices.outstandingAmountFormatted;
    const isCritical = overdueTotal >= 50000 || health.invoices.overdueCount >= 3;

    events.push({
      id: `auto-ev-overdue-${businessId}`,
      businessId,
      type: "OVERDUE_INVOICE",
      severity: isCritical ? "CRITICAL" : "HIGH",
      title: `Receivables Alert: ${health.invoices.overdueCount} overdue invoice(s) totalling ${overdueFormatted}`,
      explanation: `You have ${health.invoices.overdueCount} customer invoice(s) past their due dates. This locks up cash needed for operations.`,
      evidence: {
        overdueCount: health.invoices.overdueCount,
        overdueAmount: overdueFormatted,
      },
      recommendedAction: `Send payment reminder notices to overdue customer accounts immediately.`,
      dedupKey: buildDedupKey(businessId, "OVERDUE_INVOICE", "all", referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 5. LARGE OUTSTANDING RECEIVABLES BALANCE (HIGH)
  if (
    health.invoices.unpaidCount > 0 &&
    health.sales.thisMonth.amount > 0 &&
    health.invoices.outstandingAmount / health.sales.thisMonth.amount > 0.35
  ) {
    events.push({
      id: `auto-ev-receivables-${businessId}`,
      businessId,
      type: "LARGE_OUTSTANDING_BALANCE",
      severity: "HIGH",
      title: `High Receivables Concentration: ${health.invoices.outstandingAmountFormatted} Uncollected`,
      explanation: `Unpaid invoices represent over 35% of your monthly sales volume, restricting liquid operating capital.`,
      evidence: {
        outstandingAmount: health.invoices.outstandingAmountFormatted,
        unpaidCount: health.invoices.unpaidCount,
      },
      recommendedAction: `Prioritize invoice collection before extending further credit lines.`,
      dedupKey: buildDedupKey(businessId, "LARGE_OUTSTANDING_BALANCE", "all", referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 6. SALES DECLINE (HIGH)
  if (health.sales.monthGrowthPercent !== null && health.sales.monthGrowthPercent <= -20) {
    events.push({
      id: `auto-ev-salesdecline-${businessId}`,
      businessId,
      type: "SALES_DECLINE",
      severity: "HIGH",
      title: `Sales Velocity Drop: Revenue is down ${Math.abs(health.sales.monthGrowthPercent)}% this month`,
      explanation: `Monthly sales (${health.sales.thisMonth.formatted}) are tracking significantly below last month's pace.`,
      evidence: {
        monthGrowthPercent: health.sales.monthGrowthPercent,
        thisMonth: health.sales.thisMonth.formatted,
        lastMonth: health.sales.lastMonth.formatted,
      },
      recommendedAction: `Review pricing, re-engage previous top customers, and evaluate marketing efforts.`,
      dedupKey: buildDedupKey(businessId, "SALES_DECLINE", "month", referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 7. EXPENSE SPIKE (HIGH)
  if (
    health.sales.thisMonth.amount > 0 &&
    health.expenses.thisMonth.amount > health.sales.thisMonth.amount
  ) {
    events.push({
      id: `auto-ev-expensespike-${businessId}`,
      businessId,
      type: "EXPENSE_SPIKE",
      severity: "HIGH",
      title: `Negative Operating Margin: Expenses exceed sales this month`,
      explanation: `Operating expenses (${health.expenses.thisMonth.formatted}) currently surpass total revenue (${health.sales.thisMonth.formatted}).`,
      evidence: {
        expensesThisMonth: health.expenses.thisMonth.formatted,
        salesThisMonth: health.sales.thisMonth.formatted,
        netDeficit: health.profit.estimatedNetProfitFormatted,
      },
      recommendedAction: `Audit recent expense categories to trim discretionary spending.`,
      dedupKey: buildDedupKey(businessId, "EXPENSE_SPIKE", "month", referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  // 8. INDUSTRY ALERTS
  for (const ind of industryInsights.slice(0, 2)) {
    const severity: AutopilotSeverity = ind.category === "INVENTORY" ? "HIGH" : "MEDIUM";
    events.push({
      id: `auto-ev-ind-${ind.id}`,
      businessId,
      type: "INDUSTRY_ALERT",
      severity,
      title: ind.title,
      explanation: ind.insight,
      evidence: ind.metrics,
      recommendedAction: ind.recommendedAction,
      dedupKey: buildDedupKey(businessId, "INDUSTRY_ALERT", ind.id, referenceDate),
      createdAt: nowIso,
      expiresAt,
    });
  }

  return events;
}
