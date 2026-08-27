import { BusinessType } from "@prisma/client";
import {
  BusinessHealthMetrics,
  NeedsAttentionItem,
  BusinessRecommendation,
} from "./types";

export interface IndustryInsight {
  id: string;
  businessType: BusinessType;
  category: "INVENTORY" | "SALES" | "EXPENSES" | "CUSTOMERS" | "RECEIVABLES" | "OPERATIONS";
  title: string;
  insight: string;
  recommendedAction: string;
  metrics: Record<string, unknown>;
}

/**
 * Deterministic Industry Intelligence Engine.
 * Evaluates business health data against industry-specific operational patterns
 * without relying on LLM guesses or inventing non-existent fields.
 */
export function evaluateIndustryIntelligence(
  health: BusinessHealthMetrics,
  attention: NeedsAttentionItem[],
  businessType: BusinessType = "OTHER"
): IndustryInsight[] {
  const insights: IndustryInsight[] = [];
  const currency = health.currency;

  const topSelling = health.inventory.topSellingProducts;
  const zeroStock = health.inventory.zeroStockItems;
  const lowStock = health.inventory.lowStockItems;
  const totalRevenue = health.profit.revenue;

  switch (businessType) {
    // ── 1. RETAIL & SUPERMARKET ───────────────────────────────────────────────
    case "RETAIL":
    case "SUPERMARKET": {
      // Fast-moving & sales concentration
      if (topSelling.length > 0 && totalRevenue > 0) {
        const topProd = topSelling[0];
        const share = Math.round((topProd.revenue / totalRevenue) * 100);

        insights.push({
          id: `ind-retail-top-${topProd.id}`,
          businessType,
          category: "SALES",
          title: `Retail Velocity: "${topProd.name}" is your primary revenue driver`,
          insight: `"${topProd.name}" generated ${topProd.revenueFormatted} (${share}% of your monthly sales) across ${topProd.unitsSold} units sold.`,
          recommendedAction: `Ensure consistent supplier lead-time management for "${topProd.name}" to prevent inventory stockouts.`,
          metrics: { productId: topProd.id, share, unitsSold: topProd.unitsSold },
        });

        // Check if top performer is out of stock or low
        const isTopZero = zeroStock.some((z) => z.id === topProd.id);
        const isTopLow = lowStock.some((l) => l.id === topProd.id);

        if (isTopZero) {
          insights.push({
            id: `ind-retail-risk-zero-${topProd.id}`,
            businessType,
            category: "INVENTORY",
            title: `Critical Retail Stockout: Top Performer "${topProd.name}" is Out of Stock`,
            insight: `Your highest-selling retail item "${topProd.name}" (${share}% of monthly sales) is completely depleted.`,
            recommendedAction: `Execute an immediate restock order for "${topProd.name}" to eliminate active sales leakage.`,
            metrics: { productId: topProd.id, stockQuantity: 0, revenueShare: share },
          });
        } else if (isTopLow) {
          insights.push({
            id: `ind-retail-risk-low-${topProd.id}`,
            businessType,
            category: "INVENTORY",
            title: `High Velocity Low Stock: "${topProd.name}" needs replenishment`,
            insight: `"${topProd.name}" has high turnover velocity but is currently at or below safety reorder threshold.`,
            recommendedAction: `Place a reorder for "${topProd.name}" before shelf stock hits zero.`,
            metrics: { productId: topProd.id, stockQuantity: topProd.unitsSold },
          });
        }
      }

      // Overdue receivables impact on retail cash flow
      if (health.invoices.overdueCount > 0) {
        insights.push({
          id: `ind-retail-overdue-${health.businessId}`,
          businessType,
          category: "RECEIVABLES",
          title: `Receivables Exposure: ${health.invoices.overdueCount} overdue retail invoice(s)`,
          insight: `You have ${health.invoices.outstandingAmountFormatted} tied up in unpaid invoices, constraining working capital for inventory procurement.`,
          recommendedAction: `Follow up with outstanding customer accounts to release cash for shelf restocking.`,
          metrics: { overdueCount: health.invoices.overdueCount, total: health.invoices.outstandingAmount },
        });
      }
      break;
    }

    // ── 2. RESTAURANT ─────────────────────────────────────────────────────────
    case "RESTAURANT": {
      if (topSelling.length > 0) {
        const topDish = topSelling[0];
        insights.push({
          id: `ind-rest-top-${topDish.id}`,
          businessType,
          category: "SALES",
          title: `Popular Menu Performer: "${topDish.name}"`,
          insight: `Your sales data shows that "${topDish.name}" is one of your most frequently ordered items (${topDish.unitsSold} orders totaling ${topDish.revenueFormatted}).`,
          recommendedAction: `Ensure daily prep and ingredient availability supports expected volume for "${topDish.name}".`,
          metrics: { productId: topDish.id, orders: topDish.unitsSold },
        });
      }

      // Expense pressure (e.g. kitchen supplies/utilities)
      if (health.expenses.topCategories.length > 0) {
        const topCat = health.expenses.topCategories[0];
        insights.push({
          id: `ind-rest-expense-${health.businessId}`,
          businessType,
          category: "EXPENSES",
          title: `Operational Cost Focus: ${topCat.category}`,
          insight: `"${topCat.category}" accounts for ${topCat.percentage}% of your operational expenses this month (${topCat.formatted}).`,
          recommendedAction: `Audit daily consumable spend in "${topCat.category}" to maintain restaurant operating margins.`,
          metrics: { category: topCat.category, amount: topCat.amount, percentage: topCat.percentage },
        });
      }
      break;
    }

    // ── 3. PHARMACY ───────────────────────────────────────────────────────────
    case "PHARMACY": {
      // Focus strictly on inventory continuity (NO medical advice, NO invented expiry dates)
      if (zeroStock.length > 0) {
        insights.push({
          id: `ind-pharm-stockout-${health.businessId}`,
          businessType,
          category: "INVENTORY",
          title: `Pharmacy Catalog Stockout: ${zeroStock.length} item(s) out of stock`,
          insight: `${zeroStock.length} product(s) in your pharmacy catalog have 0 stock units available for dispensing.`,
          recommendedAction: `Review procurement schedules and place replenishment orders with authorized pharmaceutical distributors.`,
          metrics: { zeroStockCount: zeroStock.length },
        });
      }

      if (lowStock.length > 0) {
        insights.push({
          id: `ind-pharm-lowstock-${health.businessId}`,
          businessType,
          category: "INVENTORY",
          title: `Essential Inventory Alert: ${lowStock.length} low-stock item(s)`,
          insight: `${lowStock.length} item(s) are at or below reorder buffer levels.`,
          recommendedAction: `Initiate batch restock with authorized distributors to maintain continuous catalog availability for patients and walk-in customers.`,
          metrics: { lowStockCount: lowStock.length },
        });
      }
      break;
    }

    // ── 4. FASHION ────────────────────────────────────────────────────────────
    case "FASHION": {
      if (topSelling.length > 0) {
        const bestSeller = topSelling[0];
        insights.push({
          id: `ind-fashion-bestseller-${bestSeller.id}`,
          businessType,
          category: "SALES",
          title: `Fashion Trend Leader: "${bestSeller.name}"`,
          insight: `"${bestSeller.name}" is leading customer demand with ${bestSeller.unitsSold} units sold this month (${bestSeller.revenueFormatted}).`,
          recommendedAction: `Feature "${bestSeller.name}" in marketing showcases and check upcoming replenishment schedules.`,
          metrics: { productId: bestSeller.id, unitsSold: bestSeller.unitsSold },
        });
      }

      if (health.customers.topCustomers.length > 0) {
        const topCustomer = health.customers.topCustomers[0];
        insights.push({
          id: `ind-fashion-cust-${topCustomer.id}`,
          businessType,
          category: "CUSTOMERS",
          title: `Client VIP Engagement: ${topCustomer.name}`,
          insight: `Client "${topCustomer.name}" has generated ${topCustomer.totalSpentFormatted} across ${topCustomer.orderCount} purchases.`,
          recommendedAction: `Share new seasonal arrivals or exclusive previews directly with "${topCustomer.name}".`,
          metrics: { customerId: topCustomer.id, spend: topCustomer.totalSpent },
        });
      }
      break;
    }

    // ── 5. ELECTRONICS ────────────────────────────────────────────────────────
    case "ELECTRONICS": {
      // High-value product identification
      const zeroStockItems = health.inventory.zeroStockItems;
      if (zeroStockItems.length > 0) {
        const item = zeroStockItems[0];
        insights.push({
          id: `ind-elec-stockout-${item.id}`,
          businessType,
          category: "INVENTORY",
          title: `High-Value Stockout: "${item.name}" (0 units remaining)`,
          insight: `"${item.name}" (SKU: ${item.sku}) is out of stock. In electronics retail, hardware stockouts lead to immediate buyer switching.`,
          recommendedAction: `Contact primary distributor for expedited delivery on "${item.name}".`,
          metrics: { productId: item.id, sku: item.sku },
        });
      }

      if (health.invoices.overdueCount > 0) {
        insights.push({
          id: `ind-elec-receivables-${health.businessId}`,
          businessType,
          category: "RECEIVABLES",
          title: `Hardware Sales Receivables: ${health.invoices.overdueCount} overdue invoice(s)`,
          insight: `${health.invoices.outstandingAmountFormatted} in device/equipment invoices is currently past due.`,
          recommendedAction: `Issue formal payment follow-up notices to secure cash flow for ongoing inventory purchases.`,
          metrics: { overdueAmount: health.invoices.outstandingAmount },
        });
      }
      break;
    }

    // ── 6. SALON ──────────────────────────────────────────────────────────────
    case "SALON": {
      if (health.customers.topCustomers.length > 0) {
        const topClient = health.customers.topCustomers[0];
        insights.push({
          id: `ind-salon-repeat-${topClient.id}`,
          businessType,
          category: "CUSTOMERS",
          title: `Repeat Client Loyalty: ${topClient.name}`,
          insight: `"${topClient.name}" is your highest-spending client with ${topClient.totalSpentFormatted} in sales over ${topClient.orderCount} visits/transactions.`,
          recommendedAction: `Provide loyalty incentives or check-in messages to reinforce client retention.`,
          metrics: { customerId: topClient.id, totalSpend: topClient.totalSpent },
        });
      }

      if (health.expenses.topCategories.length > 0) {
        const topCat = health.expenses.topCategories[0];
        insights.push({
          id: `ind-salon-expenses-${health.businessId}`,
          businessType,
          category: "EXPENSES",
          title: `Salon Overhead Tracking: ${topCat.category}`,
          insight: `"${topCat.category}" accounts for ${topCat.percentage}% of your monthly expenses (${topCat.formatted}).`,
          recommendedAction: `Monitor recurring utility and supply expenditure in "${topCat.category}" to maximize salon profit margins.`,
          metrics: { category: topCat.category, amount: topCat.amount },
        });
      }
      break;
    }

    // ── 7. OTHER ──────────────────────────────────────────────────────────────
    case "OTHER":
    default: {
      if (topSelling.length > 0) {
        const topItem = topSelling[0];
        insights.push({
          id: `ind-gen-top-${topItem.id}`,
          businessType: "OTHER",
          category: "SALES",
          title: `Sales Leader: "${topItem.name}"`,
          insight: `"${topItem.name}" is currently your top-performing product with ${topItem.unitsSold} units sold (${topItem.revenueFormatted}).`,
          recommendedAction: `Maintain healthy inventory levels for "${topItem.name}" to sustain sales momentum.`,
          metrics: { productId: topItem.id, unitsSold: topItem.unitsSold },
        });
      }
      break;
    }
  }

  return insights;
}

/**
 * Converts industry insights into concrete, actionable Business Recommendations.
 */
export function generateIndustryRecommendations(
  insights: IndustryInsight[]
): BusinessRecommendation[] {
  return insights.map((ins) => ({
    id: `rec-ind-${ins.id}`,
    category: ins.category === "RECEIVABLES" ? "CASH_FLOW" : ins.category === "CUSTOMERS" ? "SALES" : ins.category,
    priority: ins.title.toLowerCase().includes("critical") || ins.title.toLowerCase().includes("stockout") ? "HIGH" : "MEDIUM",
    title: ins.title,
    action: ins.recommendedAction,
    rationale: ins.insight,
  }));
}
