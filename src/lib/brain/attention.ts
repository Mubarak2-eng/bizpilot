import {
  BusinessHealthMetrics,
  NeedsAttentionItem,
  BusinessBrainContext,
} from "./types";

/**
 * Deterministic "Needs Attention" Engine.
 * Evaluates business health indicators and flags high-priority operational risks.
 */
export function evaluateNeedsAttention(
  health: BusinessHealthMetrics,
  context?: BusinessBrainContext
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  const currency = health.currency || context?.currency || "NGN";

  // ── 1. Zero Stock Alerts (CRITICAL) ─────────────────────────────────────────
  for (const prod of health.inventory.zeroStockItems) {
    items.push({
      id: `att-zero-stock-${prod.id}`,
      type: "ZERO_STOCK",
      severity: "CRITICAL",
      title: `Stock Out: "${prod.name}" is completely out of stock`,
      explanation: `"${prod.name}" (SKU: ${prod.sku}) has 0 units remaining in inventory. Any attempted sale will fail or be rejected.`,
      entityType: "PRODUCT",
      entityId: prod.id,
      entityName: prod.name,
      recommendedAction: `Restock "${prod.name}" immediately to prevent lost sales.`,
      data: {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        stockQuantity: 0,
        lowStockThreshold: prod.lowStockThreshold,
      },
    });
  }

  // ── 2. Low Stock Alerts (HIGH) ──────────────────────────────────────────────
  for (const prod of health.inventory.lowStockItems) {
    items.push({
      id: `att-low-stock-${prod.id}`,
      type: "LOW_STOCK",
      severity: "HIGH",
      title: `Low Stock: "${prod.name}" (${prod.stockQuantity} units left)`,
      explanation: `"${prod.name}" (SKU: ${prod.sku}) has reached ${prod.stockQuantity} units, at or below your safety threshold of ${prod.lowStockThreshold}.`,
      entityType: "PRODUCT",
      entityId: prod.id,
      entityName: prod.name,
      recommendedAction: `Plan a replenishment order for "${prod.name}".`,
      data: {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        stockQuantity: prod.stockQuantity,
        lowStockThreshold: prod.lowStockThreshold,
      },
    });
  }

  // ── 3. Overdue Invoice Alerts (CRITICAL / HIGH) ─────────────────────────────
  for (const inv of health.invoices.overdueInvoices) {
    const isSeverelyOverdue = inv.daysOverdue >= 14;
    items.push({
      id: `att-overdue-inv-${inv.id}`,
      type: "OVERDUE_INVOICE",
      severity: isSeverelyOverdue ? "CRITICAL" : "HIGH",
      title: `Overdue Invoice: ${inv.invoiceNumber} (${inv.totalFormatted})`,
      explanation: `Invoice ${inv.invoiceNumber} issued to "${inv.customerName}" is overdue by ${inv.daysOverdue} day${inv.daysOverdue === 1 ? "" : "s"} (due date: ${inv.dueDate}).`,
      entityType: "INVOICE",
      entityId: inv.id,
      entityName: inv.invoiceNumber,
      recommendedAction: `Send a payment reminder or follow up directly with "${inv.customerName}".`,
      data: {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customerName,
        total: inv.total,
        daysOverdue: inv.daysOverdue,
        dueDate: inv.dueDate,
      },
    });
  }

  // ── 4. Unpaid Invoices Summary Alert (MEDIUM) ────────────────────────────────
  if (health.invoices.unpaidCount > 0 && health.invoices.overdueCount === 0) {
    items.push({
      id: `att-unpaid-invoices-${health.businessId}`,
      type: "UNPAID_INVOICE",
      severity: "MEDIUM",
      title: `${health.invoices.unpaidCount} Pending Invoice${health.invoices.unpaidCount > 1 ? "s" : ""} (${health.invoices.outstandingAmountFormatted})`,
      explanation: `You have ${health.invoices.unpaidCount} active unpaid invoice${health.invoices.unpaidCount > 1 ? "s" : ""} totaling ${health.invoices.outstandingAmountFormatted} awaiting customer settlement.`,
      entityType: "INVOICE",
      recommendedAction: `Review pending invoice due dates and ensure prompt payment receipts.`,
      data: {
        unpaidCount: health.invoices.unpaidCount,
        outstandingAmount: health.invoices.outstandingAmount,
      },
    });
  }

  // ── 5. Significant Sales Decline Alerts (HIGH / MEDIUM) ──────────────────────
  if (
    health.sales.monthGrowthPercent !== null &&
    health.sales.lastMonth.amount > 0 &&
    health.sales.monthGrowthPercent <= -20
  ) {
    const severity = health.sales.monthGrowthPercent <= -40 ? "HIGH" : "MEDIUM";
    items.push({
      id: `att-sales-decline-month-${health.businessId}`,
      type: "SALES_DECLINE",
      severity,
      title: `Monthly Revenue Drop (${health.sales.monthGrowthPercent}%)`,
      explanation: `Current month sales of ${health.sales.thisMonth.formatted} are down ${Math.abs(health.sales.monthGrowthPercent)}% compared to last month (${health.sales.lastMonth.formatted}).`,
      entityType: "SALES",
      recommendedAction: `Review sales activity, top customer engagement, and product availability to reverse the trend.`,
      data: {
        thisMonth: health.sales.thisMonth.amount,
        lastMonth: health.sales.lastMonth.amount,
        growthPercent: health.sales.monthGrowthPercent,
      },
    });
  }

  // ── 6. Expense Spike Alerts (MEDIUM) ─────────────────────────────────────────
  if (
    health.expenses.monthGrowthPercent !== null &&
    health.expenses.lastMonth.amount > 0 &&
    health.expenses.monthGrowthPercent >= 25
  ) {
    const topCat = health.expenses.topCategories[0];
    items.push({
      id: `att-expense-spike-month-${health.businessId}`,
      type: "EXPENSE_SPIKE",
      severity: "MEDIUM",
      title: `Expense Surge (+${health.expenses.monthGrowthPercent}%)`,
      explanation: `Monthly spending surged by ${health.expenses.monthGrowthPercent}% to ${health.expenses.thisMonth.formatted} (vs ${health.expenses.lastMonth.formatted} last month). ${topCat ? `Top category: "${topCat.category}" (${topCat.formatted}, ${topCat.percentage}% of total).` : ""}`,
      entityType: "EXPENSE",
      recommendedAction: `Audit recent expense receipts${topCat ? ` in "${topCat.category}"` : ""} to control discretionary outflow.`,
      data: {
        thisMonth: health.expenses.thisMonth.amount,
        lastMonth: health.expenses.lastMonth.amount,
        growthPercent: health.expenses.monthGrowthPercent,
        topCategory: topCat?.category,
      },
    });
  }

  // ── 7. Top Selling Product Out of Stock (CRITICAL) ──────────────────────────
  for (const topProd of health.inventory.topSellingProducts) {
    const isZeroStock = health.inventory.zeroStockItems.some((z) => z.id === topProd.id);
    if (isZeroStock) {
      items.push({
        id: `att-top-prod-out-${topProd.id}`,
        type: "UNUSUAL_PRODUCT_PERFORMANCE",
        severity: "CRITICAL",
        title: `Top Performer Stockout: "${topProd.name}"`,
        explanation: `"${topProd.name}" is one of your top revenue drivers (${topProd.unitsSold} units sold, ${topProd.revenueFormatted} revenue), but is currently out of stock.`,
        entityType: "PRODUCT",
        entityId: topProd.id,
        entityName: topProd.name,
        recommendedAction: `Prioritize emergency restocking for "${topProd.name}" to prevent high revenue leakage.`,
        data: {
          productId: topProd.id,
          productName: topProd.name,
          unitsSold: topProd.unitsSold,
          revenue: topProd.revenue,
        },
      });
    }
  }

  // Sort items by priority: CRITICAL > HIGH > MEDIUM > LOW > INFO
  const severityOrder: Record<string, number> = {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
    INFO: 5,
  };

  return items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
