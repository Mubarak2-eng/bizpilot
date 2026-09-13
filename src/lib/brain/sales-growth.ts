import { prisma } from "../prisma";
import { formatMoney } from "../money";

export interface MonthlySalesMetrics {
  currentMonthRevenue: number;
  currentMonthRevenueFormatted: string;
  currentMonthOrderCount: number;
  currentMonthAOV: number;
  currentMonthAOVFormatted: string;
  previousMonthRevenue: number;
  previousMonthRevenueFormatted: string;
  previousMonthOrderCount: number;
  previousMonthAOV: number;
  previousMonthAOVFormatted: string;
  revenueGrowthPercent: number | null;
  orderGrowthPercent: number | null;
}

export interface ProductPerformanceSummary {
  id: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  revenueFormatted: string;
  currentStock: number;
  sellingPriceFormatted: string;
}

export interface DeadStockSummary {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  lockedCapital: number;
  lockedCapitalFormatted: string;
  sellingPriceFormatted: string;
}

export interface CustomerCohortSummary {
  uniqueBuyersCount: number;
  repeatBuyersCount: number;
  repeatBuyerRatePercent: number;
  dormantCustomersCount: number;
  topSpenders: Array<{
    id: string;
    name: string;
    orderCount: number;
    totalSpent: number;
    totalSpentFormatted: string;
  }>;
}

export interface PeakTrafficSummary {
  peakDays: string[];
  peakHoursRange: string;
  weekendSalesPercentage: number;
}

export interface GrowthPlaybook {
  id: string;
  pillar: "AOV_EXPANSION" | "PRODUCT_BUNDLING" | "CUSTOMER_RETENTION" | "PEAK_TIMING" | "DEAD_STOCK_LIQUIDATION" | "GENERAL_GROWTH";
  title: string;
  action: string;
  expectedImpact: string;
  priority: "HIGH" | "MEDIUM" | "STRATEGIC";
}

export interface MonthlySalesGrowthReport {
  businessId: string;
  businessName: string;
  currency: string;
  periodLabel: string;
  metrics: MonthlySalesMetrics;
  topPerformers: ProductPerformanceSummary[];
  deadStock: DeadStockSummary[];
  totalLockedCapitalInDeadStock: number;
  totalLockedCapitalFormatted: string;
  customerCohorts: CustomerCohortSummary;
  trafficPatterns: PeakTrafficSummary;
  growthPlaybooks: GrowthPlaybook[];
  formattedSummary: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Calculates end-to-end Monthly Sales Analysis and generates 5 actionable Revenue Growth Strategies.
 */
export async function calculateMonthlySalesGrowthAnalysis(
  businessId: string,
  referenceDate = new Date()
): Promise<MonthlySalesGrowthReport> {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const currentMonthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const currentMonthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const prevMonthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const periodLabel = referenceDate.toLocaleString("en-US", { month: "long", year: "numeric" });

  // 1. Fetch Business Details
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, currency: true },
  });

  const currency = business?.currency || "NGN";
  const businessName = business?.name || "Your Business";

  // 2. Concurrently fetch sales, products, and customer records with strict multi-tenant isolation
  const [currentSales, prevSalesAgg, allProducts, allCustomers] = await Promise.all([
    // Current Month Completed Sales with Items & Customer
    prisma.sale.findMany({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: currentMonthStart, lte: currentMonthEnd },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
      },
      orderBy: { createdAt: "desc" },
    }),

    // Previous Month Aggregate
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),

    // All Products in Catalog
    prisma.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        costPrice: true,
        stockQuantity: true,
        lowStockThreshold: true,
      },
    }),

    // All Customers
    prisma.customer.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        _count: { select: { sales: true } },
      },
    }),
  ]);

  // ── 3. Calculate Core Revenue & AOV Metrics ────────────────────────────────
  let currentMonthRevenue = 0;
  const currentMonthOrderCount = currentSales.length;

  const dayCounts: Record<number, { count: number; revenue: number }> = {};
  const hourCounts: Record<number, number> = {};

  for (let i = 0; i < 7; i++) dayCounts[i] = { count: 0, revenue: 0 };
  for (let h = 0; h < 24; h++) hourCounts[h] = 0;

  // Product sales aggregation map
  const productSalesMap = new Map<
    string,
    { id: string; name: string; sku: string; unitsSold: number; revenue: number; price: number; stock: number }
  >();

  // Customer sales aggregation map
  const customerSalesMap = new Map<string, { id: string; name: string; orderCount: number; totalSpent: number }>();

  for (const sale of currentSales) {
    const saleAmount = Number(sale.totalAmount.toString());
    currentMonthRevenue += saleAmount;

    // Day & Hour distribution
    const saleDate = new Date(sale.createdAt);
    const dayOfWeek = saleDate.getDay();
    const hour = saleDate.getHours();

    dayCounts[dayOfWeek].count += 1;
    dayCounts[dayOfWeek].revenue += saleAmount;
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    // Items Breakdown
    for (const item of sale.items) {
      const prodId = item.productId;
      const qty = item.quantity;
      const itemRev = Number(item.totalAmount.toString());
      const prodName = item.product?.name || "Unnamed Product";
      const prodSku = item.product?.sku || "";
      const prodPrice = Number(item.product?.sellingPrice.toString() || item.unitPrice.toString());
      const prodStock = item.product?.stockQuantity || 0;

      const existing = productSalesMap.get(prodId) || {
        id: prodId,
        name: prodName,
        sku: prodSku,
        unitsSold: 0,
        revenue: 0,
        price: prodPrice,
        stock: prodStock,
      };

      existing.unitsSold += qty;
      existing.revenue += itemRev;
      productSalesMap.set(prodId, existing);
    }

    // Customer Breakdown
    if (sale.customer) {
      const custId = sale.customer.id;
      const custName = sale.customer.name;
      const existingCust = customerSalesMap.get(custId) || {
        id: custId,
        name: custName,
        orderCount: 0,
        totalSpent: 0,
      };
      existingCust.orderCount += 1;
      existingCust.totalSpent += saleAmount;
      customerSalesMap.set(custId, existingCust);
    }
  }

  const currentMonthAOV = currentMonthOrderCount > 0 ? Math.round(currentMonthRevenue / currentMonthOrderCount) : 0;

  const previousMonthRevenue = Number(prevSalesAgg._sum.totalAmount?.toString() || "0");
  const previousMonthOrderCount = prevSalesAgg._count.id || 0;
  const previousMonthAOV =
    previousMonthOrderCount > 0 ? Math.round(previousMonthRevenue / previousMonthOrderCount) : 0;

  let revenueGrowthPercent: number | null = null;
  if (previousMonthRevenue > 0) {
    revenueGrowthPercent = Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100);
  }

  let orderGrowthPercent: number | null = null;
  if (previousMonthOrderCount > 0) {
    orderGrowthPercent = Math.round(
      ((currentMonthOrderCount - previousMonthOrderCount) / previousMonthOrderCount) * 100
    );
  }

  const metrics: MonthlySalesMetrics = {
    currentMonthRevenue,
    currentMonthRevenueFormatted: formatMoney(currentMonthRevenue, currency),
    currentMonthOrderCount,
    currentMonthAOV,
    currentMonthAOVFormatted: formatMoney(currentMonthAOV, currency),
    previousMonthRevenue,
    previousMonthRevenueFormatted: formatMoney(previousMonthRevenue, currency),
    previousMonthOrderCount,
    previousMonthAOV,
    previousMonthAOVFormatted: formatMoney(previousMonthAOV, currency),
    revenueGrowthPercent,
    orderGrowthPercent,
  };

  // ── 4. Product Velocity & Dead Stock Analysis ─────────────────────────────
  const topPerformers: ProductPerformanceSummary[] = Array.from(productSalesMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unitsSold: p.unitsSold,
      revenue: p.revenue,
      revenueFormatted: formatMoney(p.revenue, currency),
      currentStock: p.stock,
      sellingPriceFormatted: formatMoney(p.price, currency),
    }));

  // Identify dead stock: products in catalog with 0 sales this month and available stock > 0
  const deadStock: DeadStockSummary[] = allProducts
    .filter((p) => {
      const sold = productSalesMap.get(p.id)?.unitsSold || 0;
      return sold === 0 && p.stockQuantity > 0;
    })
    .map((p) => {
      const cost = Number(p.costPrice.toString());
      const sell = Number(p.sellingPrice.toString());
      const unitValue = cost > 0 ? cost : sell;
      const lockedCapital = p.stockQuantity * unitValue;
      return {
        id: p.id,
        name: p.name,
        sku: p.sku || "",
        stockQuantity: p.stockQuantity,
        lockedCapital,
        lockedCapitalFormatted: formatMoney(lockedCapital, currency),
        sellingPriceFormatted: formatMoney(sell, currency),
      };
    })
    .sort((a, b) => b.lockedCapital - a.lockedCapital)
    .slice(0, 5);

  const totalLockedCapitalInDeadStock = deadStock.reduce((acc, curr) => acc + curr.lockedCapital, 0);
  const totalLockedCapitalFormatted = formatMoney(totalLockedCapitalInDeadStock, currency);

  // ── 5. Customer Dynamics ──────────────────────────────────────────────────
  const uniqueBuyersCount = customerSalesMap.size;
  const repeatBuyers = Array.from(customerSalesMap.values()).filter((c) => c.orderCount >= 2);
  const repeatBuyersCount = repeatBuyers.length;
  const repeatBuyerRatePercent =
    uniqueBuyersCount > 0 ? Math.round((repeatBuyersCount / uniqueBuyersCount) * 100) : 0;

  const topSpenders = Array.from(customerSalesMap.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      orderCount: c.orderCount,
      totalSpent: c.totalSpent,
      totalSpentFormatted: formatMoney(c.totalSpent, currency),
    }));

  // Dormant customers: registered customers who have purchased before, but have 0 orders this month
  const activeCustomerIds = new Set(customerSalesMap.keys());
  const dormantCustomers = allCustomers.filter(
    (c) => c._count.sales > 0 && !activeCustomerIds.has(c.id)
  );
  const dormantCustomersCount = dormantCustomers.length;

  const customerCohorts: CustomerCohortSummary = {
    uniqueBuyersCount,
    repeatBuyersCount,
    repeatBuyerRatePercent,
    dormantCustomersCount,
    topSpenders,
  };

  // ── 6. Peak Traffic & Timing Analysis ─────────────────────────────────────
  // Sort days by sales volume/count
  const sortedDays = Object.entries(dayCounts)
    .map(([dayIdx, data]) => ({ dayName: DAY_NAMES[Number(dayIdx)], count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

  const peakDays = sortedDays.filter((d) => d.count > 0).slice(0, 2).map((d) => d.dayName);
  if (peakDays.length === 0) {
    peakDays.push("Friday", "Saturday");
  }

  // Peak Hours range
  const sortedHours = Object.entries(hourCounts)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count);

  let peakHoursRange = "12:00 PM – 5:00 PM";
  if (sortedHours.length > 0 && sortedHours[0].count > 0) {
    const topH = sortedHours[0].hour;
    const endH = (topH + 3) % 24;
    const formatH = (h: number) => {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${displayH}:00 ${ampm}`;
    };
    peakHoursRange = `${formatH(topH)} – ${formatH(endH)}`;
  }

  const weekendRev = (dayCounts[0]?.revenue || 0) + (dayCounts[6]?.revenue || 0);
  const weekendSalesPercentage =
    currentMonthRevenue > 0 ? Math.round((weekendRev / currentMonthRevenue) * 100) : 0;

  const trafficPatterns: PeakTrafficSummary = {
    peakDays,
    peakHoursRange,
    weekendSalesPercentage,
  };

  // ── 7. Generate 5 Actionable Growth Playbooks ──────────────────────────────
  const growthPlaybooks: GrowthPlaybook[] = [];

  // Playbook 1: Average Order Value (AOV) Expansion
  const targetAOVThreshold = Math.max(1000, Math.round((currentMonthAOV > 0 ? currentMonthAOV * 1.3 : 10000) / 500) * 500);
  const targetAOVFormatted = formatMoney(targetAOVThreshold, currency);
  growthPlaybooks.push({
    id: `playbook-aov-${businessId}`,
    pillar: "AOV_EXPANSION",
    priority: "HIGH",
    title: `1. Raise Average Order Value with Minimum Spend Perks (Target: ${targetAOVFormatted})`,
    action: `Your current Average Order Value is ${metrics.currentMonthAOVFormatted}. Introduce a "Free Delivery" or "₦1,000 Voucher on orders above ${targetAOVFormatted}" incentive. This motivates single-item shoppers to add a second product to their basket.`,
    expectedImpact: `Directly expands basket size and raises revenue by +15% to +25% without needing new customer acquisition.`,
  });

  // Playbook 2: Product Bundling & Dead-Stock Pairing
  if (topPerformers.length > 0 && deadStock.length > 0) {
    const starProd = topPerformers[0].name;
    const deadProd = deadStock[0].name;
    growthPlaybooks.push({
      id: `playbook-bundle-${businessId}`,
      pillar: "PRODUCT_BUNDLING",
      priority: "HIGH",
      title: `2. Create a High-Converting Bundle: "${starProd}" + "${deadProd}"`,
      action: `Pair your best-seller "${starProd}" (${topPerformers[0].unitsSold} units sold this month) with slow-moving "${deadProd}" at a 10%–15% bundle savings. Place the bundle front-and-center on WhatsApp status and in POS checkout.`,
      expectedImpact: `Unlocks ${deadStock[0].lockedCapitalFormatted} tied up in dormant inventory while boosting total ticket value.`,
    });
  } else if (topPerformers.length >= 2) {
    growthPlaybooks.push({
      id: `playbook-bundle-${businessId}`,
      pillar: "PRODUCT_BUNDLING",
      priority: "HIGH",
      title: `2. Cross-Sell Combo Pack: "${topPerformers[0].name}" + "${topPerformers[1].name}"`,
      action: `Offer a combo discount when customers buy "${topPerformers[0].name}" and "${topPerformers[1].name}" together.`,
      expectedImpact: `Accelerates volume across top sellers and increases customer lifetime value.`,
    });
  } else {
    growthPlaybooks.push({
      id: `playbook-bundle-${businessId}`,
      pillar: "PRODUCT_BUNDLING",
      priority: "HIGH",
      title: `2. Product Bundling & Starter Kits`,
      action: `Group complementary items into complete packages (e.g. Starter Pack, Family Bundle) with a special package price.`,
      expectedImpact: `Increases perceived customer value and lifts total order size.`,
    });
  }

  // Playbook 3: VIP Customer Retention & Dormant Buyer Re-engagement
  if (dormantCustomersCount > 0) {
    growthPlaybooks.push({
      id: `playbook-retention-${businessId}`,
      pillar: "CUSTOMER_RETENTION",
      priority: "HIGH",
      title: `3. Re-engage ${dormantCustomersCount} Dormant Customers via WhatsApp Broadcast`,
      action: `You have ${dormantCustomersCount} past buyers who haven't ordered yet this month. Send a targeted WhatsApp campaign with a "We miss you" perk or showcasing newly arrived stock.`,
      expectedImpact: `Recovering just 15% of lapsed customers can generate instant incremental revenue this week.`,
    });
  } else if (topSpenders.length > 0) {
    const topVip = topSpenders[0].name;
    growthPlaybooks.push({
      id: `playbook-retention-${businessId}`,
      pillar: "CUSTOMER_RETENTION",
      priority: "HIGH",
      title: `3. Launch VIP Loyalty Rewards for Top Spenders (e.g. ${topVip})`,
      action: `Reach out to top buyers like "${topVip}" (${topSpenders[0].totalSpentFormatted} spent) with early access to new arrivals or exclusive loyalty discounts.`,
      expectedImpact: `Secures predictable repeat cash flow and fosters long-term brand advocacy.`,
    });
  } else {
    growthPlaybooks.push({
      id: `playbook-retention-${businessId}`,
      pillar: "CUSTOMER_RETENTION",
      priority: "HIGH",
      title: `3. Build Your Customer Database & Contact List`,
      action: `Ensure every walk-in and online buyer is logged with their phone number at POS checkout so you can follow up with WhatsApp receipts and future offers.`,
      expectedImpact: `Creates a direct, zero-cost marketing channel for recurring repeat sales.`,
    });
  }

  // Playbook 4: Peak Day & Flash Sale Strategy
  const peakDayStr = peakDays.join(" & ");
  growthPlaybooks.push({
    id: `playbook-timing-${businessId}`,
    pillar: "PEAK_TIMING",
    priority: "MEDIUM",
    title: `4. Run Time-Limited Flash Sales on Peak Days (${peakDayStr})`,
    action: `Your highest customer conversion occurs on ${peakDayStr}, especially around ${peakHoursRange}. Schedule your WhatsApp status updates, promotional broadcasts, and inventory drops right before these peak hours.`,
    expectedImpact: `Maximizes conversion rate during high-intent buyer traffic windows.`,
  });

  // Playbook 5: Dead Stock Clearance & Liquidation
  if (deadStock.length > 0) {
    const deadSample = deadStock.slice(0, 3).map((d) => `"${d.name}"`).join(", ");
    growthPlaybooks.push({
      id: `playbook-liquidation-${businessId}`,
      pillar: "DEAD_STOCK_LIQUIDATION",
      priority: "MEDIUM",
      title: `5. Flash Clearance Sale to Recover ${totalLockedCapitalFormatted} Locked Capital`,
      action: `Run a "Weekend Flash Clearance" (e.g. 20% off or Buy 2 Get 1 Free) on stagnant items: ${deadSample}.`,
      expectedImpact: `Converts sleeping stock back into liquid cash to reinvest into high-demand fast movers.`,
    });
  } else {
    growthPlaybooks.push({
      id: `playbook-liquidation-${businessId}`,
      pillar: "GENERAL_GROWTH",
      priority: "STRATEGIC",
      title: `5. Expand High-Margin Inventory & Test Category Extensions`,
      action: `Your current catalog is moving well. Reinvest healthy cash flow to negotiate bulk vendor discounts on top-sellers to increase gross profit margins.`,
      expectedImpact: `Expands overall profit margins by +3% to +8%.`,
    });
  }

  // ── 8. Formatted Executive Summary ─────────────────────────────────────────
  const growthBadge =
    revenueGrowthPercent !== null
      ? revenueGrowthPercent >= 0
        ? `📈 +${revenueGrowthPercent}% growth vs last month`
        : `📉 ${revenueGrowthPercent}% vs last month`
      : "📊 Baseline month";

  const lines: string[] = [];
  lines.push(`🚀 **Monthly Sales Intelligence & Revenue Growth Report**`);
  lines.push(`📅 **Period**: ${periodLabel} • **Business**: ${businessName}\n`);

  lines.push(`### 📊 1. Monthly Performance & Basket Size`);
  lines.push(`• **Total Revenue**: **${metrics.currentMonthRevenueFormatted}** (${metrics.currentMonthOrderCount} completed sales) [${growthBadge}]`);
  lines.push(`• **Average Order Value (AOV)**: **${metrics.currentMonthAOVFormatted}** per customer transaction`);
  if (previousMonthRevenue > 0) {
    lines.push(`• **Previous Month Comparison**: ${metrics.previousMonthRevenueFormatted} (${metrics.previousMonthOrderCount} sales, AOV: ${metrics.previousMonthAOVFormatted})`);
  }
  lines.push("");

  lines.push(`### 🏆 2. Top Revenue Drivers & Stagnant Stock`);
  if (topPerformers.length > 0) {
    lines.push(`**Top Star Products:**`);
    topPerformers.forEach((p, idx) => {
      lines.push(`${idx + 1}. **${p.name}** — ${p.revenueFormatted} (${p.unitsSold} units sold, ${p.currentStock} in stock)`);
    });
  } else {
    lines.push(`*No completed product sales recorded yet for ${periodLabel}.*`);
  }

  if (deadStock.length > 0) {
    lines.push(`\n**⏳ Stagnant Inventory (${totalLockedCapitalFormatted} locked capital):**`);
    deadStock.slice(0, 3).forEach((d) => {
      lines.push(`• **${d.name}** — ${d.stockQuantity} units in stock (${d.lockedCapitalFormatted} idle capital)`);
    });
  }
  lines.push("");

  lines.push(`### ⏰ 3. Peak Shopping Traffic & Customer Patterns`);
  lines.push(`• **Peak Shopping Days**: ${peakDayStr}`);
  lines.push(`• **Peak Transaction Window**: ${peakHoursRange}`);
  lines.push(`• **Repeat Buyer Rate**: ${repeatBuyerRatePercent}% (${repeatBuyersCount} repeat customers)`);
  if (dormantCustomersCount > 0) {
    lines.push(`• ⚠️ **Dormant Buyers**: ${dormantCustomersCount} past customers have not purchased this month.`);
  }
  lines.push("");

  lines.push(`### 💡 4. Five Actionable Strategies to Increase Your Sales`);
  growthPlaybooks.forEach((play) => {
    lines.push(`**${play.title}**`);
    lines.push(`↳ **Action**: ${play.action}`);
    lines.push(`↳ **Impact**: *${play.expectedImpact}*\n`);
  });

  const formattedSummary = lines.join("\n");

  return {
    businessId,
    businessName,
    currency,
    periodLabel,
    metrics,
    topPerformers,
    deadStock,
    totalLockedCapitalInDeadStock,
    totalLockedCapitalFormatted,
    customerCohorts,
    trafficPatterns,
    growthPlaybooks,
    formattedSummary,
  };
}
