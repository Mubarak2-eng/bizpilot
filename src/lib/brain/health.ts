import { prisma } from "../prisma";
import { formatMoney } from "../money";
import {
  BusinessHealthMetrics,
  BusinessSalesHealth,
  BusinessExpensesHealth,
  BusinessProfitHealth,
  BusinessInventoryHealth,
  CustomerHealthSummary,
  BusinessInvoicesHealth,
  PeriodMetric,
} from "./types";

/**
 * Calculates percentage growth/decline between two numeric values.
 * Returns null if previous period has zero baseline and current is zero.
 */
export function calculateGrowthPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : null;
  }
  const pct = ((current - previous) / previous) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Resolves precise Date objects for health comparisons.
 */
function getPeriodDates(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const date = referenceDate.getDate();

  // Today
  const todayStart = new Date(year, month, date, 0, 0, 0, 0);
  const todayEnd = new Date(year, month, date, 23, 59, 59, 999);

  // Yesterday
  const yesterdayStart = new Date(year, month, date - 1, 0, 0, 0, 0);
  const yesterdayEnd = new Date(year, month, date - 1, 23, 59, 59, 999);

  // This Week (Monday to Sunday)
  const day = referenceDate.getDay();
  const diffToMonday = date - day + (day === 0 ? -6 : 1);
  const thisWeekStart = new Date(year, month, diffToMonday, 0, 0, 0, 0);
  const thisWeekEnd = new Date(year, month, diffToMonday + 6, 23, 59, 59, 999);

  // Last Week
  const lastWeekStart = new Date(year, month, diffToMonday - 7, 0, 0, 0, 0);
  const lastWeekEnd = new Date(year, month, diffToMonday - 1, 23, 59, 59, 999);

  // This Month
  const thisMonthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const thisMonthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Last Month
  const lastMonthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const lastMonthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  return {
    todayStart,
    todayEnd,
    yesterdayStart,
    yesterdayEnd,
    thisWeekStart,
    thisWeekEnd,
    lastWeekStart,
    lastWeekEnd,
    thisMonthStart,
    thisMonthEnd,
    lastMonthStart,
    lastMonthEnd,
  };
}

/**
 * Deterministic Business Health Calculation Engine.
 * Scoped strictly to trusted businessId and business currency.
 */
export async function calculateBusinessHealth(
  businessId: string,
  referenceDate = new Date()
): Promise<BusinessHealthMetrics> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, currency: true, businessType: true },
  });

  if (!business) {
    throw new Error(`Business with ID ${businessId} not found`);
  }

  const currency = business.currency || "NGN";
  const dates = getPeriodDates(referenceDate);

  // ── 1. Sales Calculations ───────────────────────────────────────────────────
  const [
    todaySales,
    yesterdaySales,
    thisWeekSales,
    lastWeekSales,
    thisMonthSales,
    lastMonthSales,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.todayStart, lte: dates.todayEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.yesterdayStart, lte: dates.yesterdayEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.thisWeekStart, lte: dates.thisWeekEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.lastWeekStart, lte: dates.lastWeekEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.thisMonthStart, lte: dates.thisMonthEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: dates.lastMonthStart, lte: dates.lastMonthEnd },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),
  ]);

  const todayAmount = Number(todaySales._sum.totalAmount || 0);
  const yesterdayAmount = Number(yesterdaySales._sum.totalAmount || 0);
  const thisWeekAmount = Number(thisWeekSales._sum.totalAmount || 0);
  const lastWeekAmount = Number(lastWeekSales._sum.totalAmount || 0);
  const thisMonthAmount = Number(thisMonthSales._sum.totalAmount || 0);
  const lastMonthAmount = Number(lastMonthSales._sum.totalAmount || 0);

  const salesHealth: BusinessSalesHealth = {
    today: {
      amount: todayAmount,
      count: todaySales._count.id || 0,
      formatted: formatMoney(todayAmount, currency),
    },
    yesterday: {
      amount: yesterdayAmount,
      count: yesterdaySales._count.id || 0,
      formatted: formatMoney(yesterdayAmount, currency),
    },
    dayGrowthPercent: calculateGrowthPercent(todayAmount, yesterdayAmount),
    thisWeek: {
      amount: thisWeekAmount,
      count: thisWeekSales._count.id || 0,
      formatted: formatMoney(thisWeekAmount, currency),
    },
    lastWeek: {
      amount: lastWeekAmount,
      count: lastWeekSales._count.id || 0,
      formatted: formatMoney(lastWeekAmount, currency),
    },
    weekGrowthPercent: calculateGrowthPercent(thisWeekAmount, lastWeekAmount),
    thisMonth: {
      amount: thisMonthAmount,
      count: thisMonthSales._count.id || 0,
      formatted: formatMoney(thisMonthAmount, currency),
    },
    lastMonth: {
      amount: lastMonthAmount,
      count: lastMonthSales._count.id || 0,
      formatted: formatMoney(lastMonthAmount, currency),
    },
    monthGrowthPercent: calculateGrowthPercent(thisMonthAmount, lastMonthAmount),
  };

  // ── 2. Expense Calculations ─────────────────────────────────────────────────
  const [todayExpenses, thisMonthExpenses, lastMonthExpenses, categoryGroupedExpenses] =
    await Promise.all([
      prisma.expense.aggregate({
        where: {
          businessId,
          createdAt: { gte: dates.todayStart, lte: dates.todayEnd },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: {
          businessId,
          createdAt: { gte: dates.thisMonthStart, lte: dates.thisMonthEnd },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.aggregate({
        where: {
          businessId,
          createdAt: { gte: dates.lastMonthStart, lte: dates.lastMonthEnd },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: {
          businessId,
          createdAt: { gte: dates.thisMonthStart, lte: dates.thisMonthEnd },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
    ]);

  const todayExpenseAmount = Number(todayExpenses._sum.amount || 0);
  const thisMonthExpenseAmount = Number(thisMonthExpenses._sum.amount || 0);
  const lastMonthExpenseAmount = Number(lastMonthExpenses._sum.amount || 0);

  const topCategories = categoryGroupedExpenses.map((c) => {
    const catAmount = Number(c._sum.amount || 0);
    const pct = thisMonthExpenseAmount > 0 ? (catAmount / thisMonthExpenseAmount) * 100 : 0;
    return {
      category: c.category,
      amount: catAmount,
      formatted: formatMoney(catAmount, currency),
      percentage: Math.round(pct * 10) / 10,
    };
  });

  const expensesHealth: BusinessExpensesHealth = {
    today: {
      amount: todayExpenseAmount,
      count: todayExpenses._count.id || 0,
      formatted: formatMoney(todayExpenseAmount, currency),
    },
    thisMonth: {
      amount: thisMonthExpenseAmount,
      count: thisMonthExpenses._count.id || 0,
      formatted: formatMoney(thisMonthExpenseAmount, currency),
    },
    lastMonth: {
      amount: lastMonthExpenseAmount,
      count: lastMonthExpenses._count.id || 0,
      formatted: formatMoney(lastMonthExpenseAmount, currency),
    },
    monthGrowthPercent: calculateGrowthPercent(thisMonthExpenseAmount, lastMonthExpenseAmount),
    topCategories,
  };

  // ── 3. Profit & Margin Calculations ─────────────────────────────────────────
  const revenue = thisMonthAmount;
  const expenses = thisMonthExpenseAmount;
  const estimatedNetProfit = revenue - expenses;
  const estimatedMarginPercent =
    revenue > 0 ? Math.round(((estimatedNetProfit / revenue) * 100) * 10) / 10 : null;

  const profitHealth: BusinessProfitHealth = {
    revenue,
    revenueFormatted: formatMoney(revenue, currency),
    expenses,
    expensesFormatted: formatMoney(expenses, currency),
    estimatedNetProfit,
    estimatedNetProfitFormatted: formatMoney(estimatedNetProfit, currency),
    estimatedMarginPercent,
  };

  // ── 4. Inventory Calculations ───────────────────────────────────────────────
  const [allProducts, topProductsGroup] = await Promise.all([
    prisma.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        stockQuantity: true,
        lowStockThreshold: true,
      },
      orderBy: { stockQuantity: "asc" },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          businessId,
          status: "COMPLETED",
          createdAt: { gte: dates.thisMonthStart, lte: dates.thisMonthEnd },
        },
      },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
  ]);

  const zeroStockItems = allProducts
    .filter((p) => p.stockQuantity === 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      sellingPriceFormatted: formatMoney(Number(p.sellingPrice), currency),
    }));

  const lowStockItems = allProducts
    .filter((p) => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      sellingPriceFormatted: formatMoney(Number(p.sellingPrice), currency),
    }));

  const productMap = new Map(allProducts.map((p) => [p.id, p]));
  const topSellingProducts = topProductsGroup.map((item) => {
    const prod = productMap.get(item.productId);
    const rev = Number(item._sum.totalAmount || 0);
    return {
      id: item.productId,
      name: prod?.name || "Unknown Product",
      sku: prod?.sku || "N/A",
      unitsSold: item._sum.quantity || 0,
      revenue: rev,
      revenueFormatted: formatMoney(rev, currency),
    };
  });

  const inventoryHealth: BusinessInventoryHealth = {
    totalProducts: allProducts.length,
    lowStockCount: lowStockItems.length,
    zeroStockCount: zeroStockItems.length,
    lowStockItems,
    zeroStockItems,
    topSellingProducts,
  };

  // ── 5. Customers Calculations ───────────────────────────────────────────────
  const [totalCustomersCount, topCustomersDb, unpaidInvoicesWithCustomer] = await Promise.all([
    prisma.customer.count({ where: { businessId } }),
    prisma.customer.findMany({
      where: { businessId },
      include: {
        sales: {
          where: { status: "COMPLETED" },
          select: { totalAmount: true },
        },
      },
      take: 20,
    }),
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["SENT", "OVERDUE", "DRAFT"] },
      },
      include: { customer: { select: { id: true, name: true } } },
    }),
  ]);

  const topCustomers = topCustomersDb
    .map((c) => {
      const orderCount = c.sales.length;
      const totalSpent = c.sales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
      return {
        id: c.id,
        name: c.name,
        orderCount,
        totalSpent,
        totalSpentFormatted: formatMoney(totalSpent, currency),
      };
    })
    .filter((c) => c.orderCount > 0)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5);

  const customerBalanceMap = new Map<string, { id: string; name: string; unpaidCount: number; totalOwed: number }>();
  for (const inv of unpaidInvoicesWithCustomer) {
    const custId = inv.customer.id;
    const existing = customerBalanceMap.get(custId) || {
      id: custId,
      name: inv.customer.name,
      unpaidCount: 0,
      totalOwed: 0,
    };
    existing.unpaidCount += 1;
    existing.totalOwed += Number(inv.total);
    customerBalanceMap.set(custId, existing);
  }

  const customersWithBalances = Array.from(customerBalanceMap.values())
    .map((c) => ({
      id: c.id,
      name: c.name,
      unpaidInvoiceCount: c.unpaidCount,
      totalOwed: c.totalOwed,
      totalOwedFormatted: formatMoney(c.totalOwed, currency),
    }))
    .sort((a, b) => b.totalOwed - a.totalOwed);

  const customerHealth: CustomerHealthSummary = {
    totalCustomers: totalCustomersCount,
    topCustomers,
    customersWithBalances,
  };

  // ── 6. Invoices Calculations ────────────────────────────────────────────────
  const allUnpaidInvoices = await prisma.invoice.findMany({
    where: {
      businessId,
      status: { in: ["DRAFT", "SENT", "OVERDUE"] },
    },
    include: { customer: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const nowTime = referenceDate.getTime();
  let overdueCount = 0;
  let outstandingTotal = 0;
  const overdueList = [];

  for (const inv of allUnpaidInvoices) {
    const invTotal = Number(inv.total);
    outstandingTotal += invTotal;

    const dueTime = new Date(inv.dueDate).getTime();
    if (dueTime < nowTime) {
      overdueCount += 1;
      const daysOverdue = Math.max(1, Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24)));
      overdueList.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        total: invTotal,
        totalFormatted: formatMoney(invTotal, currency),
        dueDate: inv.dueDate.toISOString().split("T")[0],
        daysOverdue,
      });
    }
  }

  const invoicesHealth: BusinessInvoicesHealth = {
    unpaidCount: allUnpaidInvoices.length,
    overdueCount,
    outstandingAmount: outstandingTotal,
    outstandingAmountFormatted: formatMoney(outstandingTotal, currency),
    overdueInvoices: overdueList,
  };

  return {
    businessId: business.id,
    businessName: business.name,
    currency,
    businessType: business.businessType || "OTHER",
    sales: salesHealth,
    expenses: expensesHealth,
    profit: profitHealth,
    inventory: inventoryHealth,
    customers: customerHealth,
    invoices: invoicesHealth,
  };
}
