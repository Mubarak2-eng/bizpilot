import { BusinessHealthMetrics } from "../brain/types";
import { BusinessOpportunity } from "./types";

/**
 * Detects grounded commercial opportunities from active database metrics.
 * Follows zero-hallucination rules: every numerical claim is strictly derived from real data.
 */
export function detectBusinessOpportunities(
  health: BusinessHealthMetrics
): BusinessOpportunity[] {
  const opportunities: BusinessOpportunity[] = [];

  // 1. Top Revenue Driver Opportunity
  if (health.inventory.topSellingProducts.length > 0) {
    const topProd = health.inventory.topSellingProducts[0];
    if (health.sales.thisMonth.amount > 0) {
      const share = Math.round((topProd.revenue / health.sales.thisMonth.amount) * 100);
      if (share >= 15) {
        opportunities.push({
          id: `opp-top-product-${topProd.id}`,
          title: `Capitalize on Best-Seller Demand: "${topProd.name}"`,
          category: "PRODUCT_EXPANSION",
          explanation: `"${topProd.name}" is your primary growth engine, generating ${topProd.revenueFormatted} (${share}% of total sales this month) across ${topProd.unitsSold} units sold.`,
          evidence: `Generated ${topProd.revenueFormatted} (${share}% share) across ${topProd.unitsSold} units this month.`,
          recommendedNextStep: `Ensure strong supplier reorder channels and consider bundle promotions around "${topProd.name}".`,
          metrics: { productId: topProd.id, share, revenue: topProd.revenue, unitsSold: topProd.unitsSold },
        });
      }
    }
  }

  // 2. High-Value Repeat Customer Retention Opportunity
  if (health.customers.topCustomers.length > 0) {
    const topCust = health.customers.topCustomers[0];
    if (topCust.totalSpent > 0 && topCust.orderCount >= 2) {
      opportunities.push({
        id: `opp-top-cust-${topCust.id}`,
        title: `VIP Client Retention: Re-engage "${topCust.name}"`,
        category: "CUSTOMER_EXPANSION",
        explanation: `"${topCust.name}" is one of your most valuable clients, having spent ${topCust.totalSpentFormatted} across ${topCust.orderCount} separate orders.`,
        evidence: `Lifetime spend of ${topCust.totalSpentFormatted} with ${topCust.orderCount} repeat orders.`,
        recommendedNextStep: `Send a personalized VIP appreciation note or early access offer to drive repeat business.`,
        metrics: { customerId: topCust.id, totalSpent: topCust.totalSpent, orderCount: topCust.orderCount },
      });
    }
  }

  // 3. Positive Sales Momentum Opportunity
  if (health.sales.monthGrowthPercent !== null && health.sales.monthGrowthPercent >= 15) {
    opportunities.push({
      id: `opp-sales-growth-${health.businessId}`,
      title: `Accelerating Sales Velocity: Up +${health.sales.monthGrowthPercent}% vs Last Month`,
      category: "SALES_GROWTH",
      explanation: `Your sales momentum is outperforming last month by +${health.sales.monthGrowthPercent}% (${health.sales.thisMonth.formatted} generated so far).`,
      evidence: `Sales increased from ${health.sales.lastMonth.formatted} last month to ${health.sales.thisMonth.formatted} this month (+${health.sales.monthGrowthPercent}%).`,
      recommendedNextStep: `Double down on your highest-performing product lines to sustain trading velocity.`,
      metrics: { growthPercent: health.sales.monthGrowthPercent },
    });
  }

  // 4. Healthy Profit Margin Opportunity
  if (
    health.profit.estimatedMarginPercent !== null &&
    health.profit.estimatedMarginPercent >= 30 &&
    health.profit.estimatedNetProfit > 0
  ) {
    opportunities.push({
      id: `opp-margin-health-${health.businessId}`,
      title: `Strong Operating Margins (${health.profit.estimatedMarginPercent}% Net Margin)`,
      category: "MARGIN_OPTIMIZATION",
      explanation: `Your business is generating an estimated net profit of ${health.profit.estimatedNetProfitFormatted} with a healthy ${health.profit.estimatedMarginPercent}% margin.`,
      evidence: `Estimated net profit of ${health.profit.estimatedNetProfitFormatted} on ${health.sales.thisMonth.formatted} monthly revenue.`,
      recommendedNextStep: `Consider reinvesting surplus operating cash flow into expanding your high-margin catalog lines.`,
      metrics: { netProfit: health.profit.estimatedNetProfit, marginPercent: health.profit.estimatedMarginPercent },
    });
  }

  return opportunities;
}
