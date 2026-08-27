import { calculateBusinessHealth } from "./health";
import { evaluateNeedsAttention } from "./attention";
import { generateRecommendations } from "./recommendations";
import {
  evaluateIndustryIntelligence,
  generateIndustryRecommendations,
  IndustryInsight,
} from "./industry";
import { BusinessBrief, BusinessBrainContext } from "./types";

/**
 * Builds a formatted executive summary string suitable for WhatsApp, dashboard cards, or AI responses.
 */
function buildFormattedSummary(brief: {
  businessName: string;
  currency: string;
  businessType: string;
  headline: string;
  health: ReturnType<typeof calculateBusinessHealth> extends Promise<infer T> ? T : never;
  attention: ReturnType<typeof evaluateNeedsAttention>;
  industryInsights: IndustryInsight[];
  recommendations: ReturnType<typeof generateRecommendations>;
}): string {
  const { businessName, businessType, health, attention, industryInsights, recommendations } = brief;

  const lines: string[] = [];

  lines.push(`🧠 **BizPilot Business Brief for ${businessName}** [${businessType}]`);
  lines.push(`*${brief.headline}*\n`);

  // Financial Snapshot
  lines.push(`📊 **Financial Health Snapshot**:`);
  lines.push(`• **Sales Today**: ${health.sales.today.formatted} (${health.sales.today.count} orders)`);
  lines.push(`• **Sales This Month**: ${health.sales.thisMonth.formatted} (${health.sales.thisMonth.count} orders)${health.sales.monthGrowthPercent !== null ? ` [${health.sales.monthGrowthPercent >= 0 ? "+" : ""}${health.sales.monthGrowthPercent}% vs last month]` : ""}`);
  lines.push(`• **Expenses This Month**: ${health.expenses.thisMonth.formatted}`);
  lines.push(`• **Estimated Net Profit**: ${health.profit.estimatedNetProfitFormatted}${health.profit.estimatedMarginPercent !== null ? ` (${health.profit.estimatedMarginPercent}% margin)` : ""}\n`);

  // Industry Intelligence Section
  if (industryInsights.length > 0) {
    lines.push(`🏢 **${businessType} Operational Intelligence**:`);
    for (const ind of industryInsights.slice(0, 2)) {
      lines.push(`• **${ind.title}**\n  ↳ ${ind.insight}`);
    }
    lines.push("");
  }

  // Receivables & Invoices
  if (health.invoices.unpaidCount > 0) {
    lines.push(`🧾 **Invoices & Receivables**:`);
    lines.push(`• Outstanding: ${health.invoices.outstandingAmountFormatted} across ${health.invoices.unpaidCount} unpaid invoice(s)`);
    if (health.invoices.overdueCount > 0) {
      lines.push(`• ⚠️ **Overdue**: ${health.invoices.overdueCount} invoice(s) need immediate collection`);
    }
    lines.push("");
  }

  // Needs Attention
  if (attention.length > 0) {
    lines.push(`⚠️ **Needs Attention (${attention.length})**:`);
    for (const item of attention.slice(0, 4)) {
      const icon = item.severity === "CRITICAL" ? "🔴" : item.severity === "HIGH" ? "🟠" : "🟡";
      lines.push(`${icon} **${item.title}**\n  ↳ ${item.recommendedAction}`);
    }
    lines.push("");
  } else {
    lines.push(`✅ **Inventory & Operations**: All inventory levels are healthy with zero overdue invoices.\n`);
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push(`💡 **Recommended Next Actions**:`);
    for (let i = 0; i < Math.min(recommendations.length, 3); i++) {
      const rec = recommendations[i];
      lines.push(`${i + 1}. **${rec.title}**\n   ${rec.action}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generates an end-to-end Business Brief combining health metrics,
 * deterministic attention flags, industry-specific insights, and grounded recommendations.
 */
export async function generateBusinessBrief(
  businessId: string,
  context?: BusinessBrainContext,
  referenceDate = new Date()
): Promise<BusinessBrief> {
  const health = await calculateBusinessHealth(businessId, referenceDate);
  const attention = evaluateNeedsAttention(health, context);
  const baseRecommendations = generateRecommendations(attention, health, context);

  // Industry Intelligence
  const businessType = health.businessType || context?.businessType || "OTHER";
  const industryInsights = evaluateIndustryIntelligence(health, attention, businessType);
  const industryRecommendations = generateIndustryRecommendations(industryInsights);

  // Combine recommendations: base prioritized first, then industry specific
  const allRecommendations = [...baseRecommendations, ...industryRecommendations];

  // Generate dynamic executive headline
  let headline = "Business operations running smoothly.";
  const criticalItems = attention.filter((a) => a.severity === "CRITICAL");
  const highItems = attention.filter((a) => a.severity === "HIGH");

  if (criticalItems.length > 0) {
    headline = `Action Required: ${criticalItems.length} critical operational situation${criticalItems.length > 1 ? "s" : ""}.`;
  } else if (highItems.length > 0) {
    headline = `Attention Recommended: ${highItems.length} high-priority item${highItems.length > 1 ? "s" : ""}.`;
  } else if (health.sales.today.amount > 0) {
    headline = `Active trading: ${health.sales.today.formatted} generated today across ${health.sales.today.count} transactions.`;
  }

  const generatedAt = referenceDate.toISOString();

  const formattedSummary = buildFormattedSummary({
    businessName: health.businessName,
    currency: health.currency,
    businessType,
    headline,
    health,
    attention,
    industryInsights,
    recommendations: allRecommendations,
  });

  return {
    businessId: health.businessId,
    businessName: health.businessName,
    currency: health.currency,
    businessType,
    generatedAt,
    headline,
    health,
    attention,
    industryInsights,
    recommendations: allRecommendations,
    formattedSummary,
  };
}
