import { BusinessHealthMetrics } from "../brain/types";
import { AutopilotEvent, BusinessOpportunity, MorningBrief } from "./types";

/**
 * Generates a crisp, executive Morning Business Brief for African SME owners.
 */
export function generateMorningBrief(
  health: BusinessHealthMetrics,
  events: AutopilotEvent[],
  opportunities: BusinessOpportunity[],
  referenceDate = new Date()
): MorningBrief {
  const businessName = health.businessName;
  const businessType = health.businessType;
  const currency = health.currency;

  const dateStr = referenceDate.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Financial snapshot
  const financialSnapshot = {
    salesTodayFormatted: `${health.sales.today.formatted} (${health.sales.today.count} orders)`,
    salesThisMonthFormatted: `${health.sales.thisMonth.formatted} (${health.sales.thisMonth.count} orders)`,
    salesGrowthFormatted:
      health.sales.monthGrowthPercent !== null
        ? `${health.sales.monthGrowthPercent >= 0 ? "+" : ""}${health.sales.monthGrowthPercent}% vs last month`
        : undefined,
    expensesThisMonthFormatted: health.expenses.thisMonth.formatted,
    estimatedNetProfitFormatted: `${health.profit.estimatedNetProfitFormatted}${health.profit.estimatedMarginPercent !== null ? ` (${health.profit.estimatedMarginPercent}% margin)` : ""}`,
    unpaidInvoicesFormatted:
      health.invoices.unpaidCount > 0
        ? `${health.invoices.outstandingAmountFormatted} across ${health.invoices.unpaidCount} unpaid invoices (${health.invoices.overdueCount} overdue)`
        : "₦0 (All invoices fully paid)",
    inventorySummary: `${health.inventory.totalProducts} catalog products (${health.inventory.zeroStockCount} out of stock, ${health.inventory.lowStockCount} low stock)`,
  };

  // 1. Three Things to Know
  const threeThingsToKnow: string[] = [];
  if (health.sales.today.amount > 0) {
    threeThingsToKnow.push(
      `Sales are active today: ${health.sales.today.formatted} recorded across ${health.sales.today.count} transaction(s).`
    );
  } else {
    threeThingsToKnow.push(
      `Trading starting for today. Monthly sales stand at ${health.sales.thisMonth.formatted}.`
    );
  }

  if (health.inventory.zeroStockCount > 0) {
    threeThingsToKnow.push(
      `You have ${health.inventory.zeroStockCount} item(s) completely out of stock on your shelves.`
    );
  } else if (health.inventory.lowStockCount > 0) {
    threeThingsToKnow.push(
      `${health.inventory.lowStockCount} item(s) are running low and approaching safety thresholds.`
    );
  } else {
    threeThingsToKnow.push("All catalog products are fully stocked with zero depleted items.");
  }

  if (health.invoices.overdueCount > 0) {
    threeThingsToKnow.push(
      `⚠️ ${health.invoices.outstandingAmountFormatted} pending across customer invoices with ${health.invoices.overdueCount} overdue.`
    );
  } else if (health.invoices.unpaidCount > 0) {
    threeThingsToKnow.push(
      `${health.invoices.outstandingAmountFormatted} is currently pending payment across unpaid invoices.`
    );
  } else {
    threeThingsToKnow.push("Zero unpaid customer invoices. Your cash collections are fully up to date.");
  }

  // 2. Today's Priorities (Top 3 events)
  const todayPriorities: string[] = [];
  for (const ev of events.slice(0, 3)) {
    todayPriorities.push(`${ev.title} — ${ev.recommendedAction}`);
  }
  if (todayPriorities.length === 0) {
    todayPriorities.push("Maintain smooth floor operations and keep shelves stocked.");
    todayPriorities.push("Follow up on new customer inquiries.");
    todayPriorities.push("Review evening sales reconciliation.");
  }

  // 3. Top Opportunity
  const topOpportunity = opportunities[0]
    ? `💡 **${opportunities[0].title}**: ${opportunities[0].recommendedNextStep}`
    : null;

  // Build formatted text message
  const lines: string[] = [];
  lines.push(`☀️ **GOOD MORNING — BIZPILOT**`);
  lines.push(`🏢 *${businessName}* [${businessType}]`);
  lines.push(`📅 ${dateStr}\n`);

  lines.push(`📊 **Financial Snapshot**:`);
  lines.push(`• Sales This Month: ${financialSnapshot.salesThisMonthFormatted}${financialSnapshot.salesGrowthFormatted ? ` [${financialSnapshot.salesGrowthFormatted}]` : ""}`);
  lines.push(`• Expenses This Month: ${financialSnapshot.expensesThisMonthFormatted}`);
  lines.push(`• Estimated Profit: ${financialSnapshot.estimatedNetProfitFormatted}`);
  lines.push(`• Unpaid Invoices: ${financialSnapshot.unpaidInvoicesFormatted}`);
  lines.push(`• Inventory: ${financialSnapshot.inventorySummary}\n`);

  lines.push(`🧠 **THREE THINGS TO KNOW**:`);
  threeThingsToKnow.slice(0, 3).forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item}`);
  });
  lines.push("");

  lines.push(`🎯 **TODAY'S PRIORITIES**:`);
  todayPriorities.slice(0, 3).forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item}`);
  });
  lines.push("");

  if (topOpportunity) {
    lines.push(`🚀 **TOP OPPORTUNITY**:`);
    lines.push(topOpportunity);
    lines.push("");
  }

  return {
    businessId: health.businessId,
    businessName,
    currency,
    businessType,
    date: dateStr,
    financialSnapshot,
    threeThingsToKnow,
    todayPriorities,
    topOpportunity,
    formattedMessage: lines.join("\n"),
  };
}
