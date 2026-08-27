import {
  BusinessHealthMetrics,
  NeedsAttentionItem,
  BusinessRecommendation,
  BusinessBrainContext,
} from "./types";

/**
 * Deterministic Business Recommendation Engine.
 * Formulates grounded, actionable business recommendations from health indicators and attention alerts.
 */
export function generateRecommendations(
  attentionItems: NeedsAttentionItem[],
  health: BusinessHealthMetrics,
  context?: BusinessBrainContext
): BusinessRecommendation[] {
  const recommendations: BusinessRecommendation[] = [];
  const currency = health.currency || context?.currency || "NGN";

  // ── 1. Recommendations from Critical / High Inventory Alerts ───────────────
  const zeroStockAlerts = attentionItems.filter((a) => a.type === "ZERO_STOCK");
  if (zeroStockAlerts.length > 0) {
    const productNames = zeroStockAlerts.map((a) => `"${a.entityName}"`).slice(0, 3).join(", ");
    const remainingCount = zeroStockAlerts.length > 3 ? ` and ${zeroStockAlerts.length - 3} other items` : "";

    recommendations.push({
      id: `rec-restock-urgent-${health.businessId}`,
      category: "INVENTORY",
      priority: "HIGH",
      title: `Emergency Restock: ${zeroStockAlerts.length} product${zeroStockAlerts.length > 1 ? "s" : ""} out of stock`,
      action: `Place purchase orders immediately for ${productNames}${remainingCount}.`,
      rationale: `Stockouts directly cause lost revenue and turn away customers.`,
    });
  }

  const lowStockAlerts = attentionItems.filter((a) => a.type === "LOW_STOCK");
  if (lowStockAlerts.length > 0) {
    const sample = lowStockAlerts.slice(0, 2).map((a) => a.entityName).join(", ");
    recommendations.push({
      id: `rec-replenish-low-stock-${health.businessId}`,
      category: "INVENTORY",
      priority: "MEDIUM",
      title: `Replenish Low Stock (${lowStockAlerts.length} items)`,
      action: `Review current stock buffer for ${sample}${lowStockAlerts.length > 2 ? " and others" : ""} and reorder before depletion.`,
      rationale: `Proactive inventory ordering prevents sudden out-of-stock events and supplier lead-time delays.`,
    });
  }

  // ── 2. Recommendations for Cash Flow / Overdue Invoices ─────────────────────
  const overdueAlerts = attentionItems.filter((a) => a.type === "OVERDUE_INVOICE");
  if (overdueAlerts.length > 0) {
    const topOverdue = health.invoices.overdueInvoices[0];
    recommendations.push({
      id: `rec-chase-overdue-${health.businessId}`,
      category: "CASH_FLOW",
      priority: "HIGH",
      title: `Recover ${health.invoices.outstandingAmountFormatted} in Overdue Receivables`,
      action: topOverdue
        ? `Contact "${topOverdue.customerName}" regarding overdue invoice ${topOverdue.invoiceNumber} (${topOverdue.totalFormatted}, ${topOverdue.daysOverdue} days overdue).`
        : `Send payment reminder notices to all customers with overdue invoices.`,
      rationale: `Speeding up invoice collection directly improves working capital and cash on hand.`,
    });
  }

  // ── 3. Recommendations for Expense Spikes ──────────────────────────────────
  const expenseSpike = attentionItems.find((a) => a.type === "EXPENSE_SPIKE");
  if (expenseSpike) {
    const topCategory = health.expenses.topCategories[0];
    recommendations.push({
      id: `rec-audit-expenses-${health.businessId}`,
      category: "EXPENSES",
      priority: "MEDIUM",
      title: `Audit Monthly Expenditure (+${health.expenses.monthGrowthPercent}%)`,
      action: topCategory
        ? `Review itemized expenses in the "${topCategory.category}" category (${topCategory.formatted}, ${topCategory.percentage}% of month total) to identify non-essential costs.`
        : `Review recent operational expenses to optimize cost efficiency.`,
      rationale: `Controlling overhead protects your net profit margin (${health.profit.estimatedMarginPercent !== null ? `${health.profit.estimatedMarginPercent}%` : "current margin"}).`,
    });
  }

  // ── 4. Recommendations for Sales Growth or Customer Retention ──────────────
  if (health.customers.topCustomers.length > 0) {
    const topCust = health.customers.topCustomers[0];
    recommendations.push({
      id: `rec-retain-top-customers-${health.businessId}`,
      category: "SALES",
      priority: "LOW",
      title: `Engage High-Value Customer: ${topCust.name}`,
      action: `Reach out to "${topCust.name}" (${topCust.totalSpentFormatted} in total orders) with a personalized check-in or loyalty incentive.`,
      rationale: `Retaining top repeat customers is significantly more cost-effective than acquiring new leads.`,
    });
  }

  // ── 5. Insufficient Data Guidance ──────────────────────────────────────────
  if (
    health.sales.thisMonth.count === 0 &&
    health.inventory.totalProducts === 0 &&
    health.customers.totalCustomers === 0
  ) {
    recommendations.push({
      id: `rec-get-started-${health.businessId}`,
      category: "OPERATIONS",
      priority: "HIGH",
      title: `Start Populating Business Records`,
      action: `Add your product catalog and record your first sale or customer in BizPilot.`,
      rationale: `The Business Brain needs operational transactions to provide accurate financial forecasting and inventory alerts.`,
    });
  }

  return recommendations;
}
