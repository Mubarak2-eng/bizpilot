import { prisma } from "../prisma";
import { verifyBusinessMembership } from "../membership";
import { formatMoney } from "../money";
import { resolveDateRange } from "./date-utils";
import {
  generateBusinessBrief,
  calculateBusinessHealth,
  evaluateNeedsAttention,
  generateRecommendations,
} from "../brain";
import { evaluateBusinessAutopilot } from "../autopilot";
import {
  AuthenticatedAIContext,
  BusinessSummaryParams,
  CustomerSummaryParams,
  CustomersQueryParams,
  ExpensesQueryParams,
  InvoicesQueryParams,
  LowStockParams,
  ProductQueryParams,
  SalesQueryParams,
  ToolDefinition,
  TopProductsParams,
} from "./types";
import { PaymentMethod, InvoiceStatus } from "@prisma/client";

// Maximum result limit for any tool query
const MAX_QUERY_LIMIT = 50;

/**
 * 1. get_business_summary
 */
export async function get_business_summary(
  _params: BusinessSummaryParams,
  context: AuthenticatedAIContext
) {
  // Independent authorization check
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const now = new Date();
  const todayRange = resolveDateRange("today", null, null, now);
  const monthRange = resolveDateRange("this_month", null, null, now);

  // Run aggregate queries concurrently
  const [
    salesTodayAgg,
    salesMonthAgg,
    allSalesAgg,
    expensesMonthAgg,
    allExpensesAgg,
    productCount,
    lowStockProducts,
    customerCount,
    outstandingInvoices,
  ] = await Promise.all([
    // Sales today
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: todayRange.startDate, lte: todayRange.endDate },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),

    // Sales this month
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: monthRange.startDate, lte: monthRange.endDate },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),

    // All sales
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    }),

    // Expenses this month
    prisma.expense.aggregate({
      where: {
        businessId,
        createdAt: { gte: monthRange.startDate, lte: monthRange.endDate },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // All expenses
    prisma.expense.aggregate({
      where: { businessId },
      _sum: { amount: true },
      _count: { id: true },
    }),

    // Total products
    prisma.product.count({ where: { businessId } }),

    // Low stock products
    prisma.product.findMany({
      where: { businessId },
      select: { id: true, name: true, sku: true, stockQuantity: true, lowStockThreshold: true },
    }),

    // Total customers
    prisma.customer.count({ where: { businessId } }),

    // Outstanding invoices (SENT or OVERDUE)
    prisma.invoice.aggregate({
      where: {
        businessId,
        status: { in: ["SENT", "OVERDUE"] },
      },
      _sum: { total: true },
      _count: { id: true },
    }),
  ]);

  const salesTodayNum = Number(salesTodayAgg._sum.totalAmount?.toString() || 0);
  const salesMonthNum = Number(salesMonthAgg._sum.totalAmount?.toString() || 0);
  const totalSalesNum = Number(allSalesAgg._sum.totalAmount?.toString() || 0);
  const expensesMonthNum = Number(expensesMonthAgg._sum.amount?.toString() || 0);
  const totalExpensesNum = Number(allExpensesAgg._sum.amount?.toString() || 0);
  const outstandingInvoicesNum = Number(outstandingInvoices._sum.total?.toString() || 0);

  const lowStockFiltered = lowStockProducts.filter((p) => p.stockQuantity <= p.lowStockThreshold);
  const estimatedMonthProfit = salesMonthNum - expensesMonthNum;

  return {
    businessName: membership.business.name,
    currency,
    salesToday: {
      amount: salesTodayNum,
      formatted: formatMoney(salesTodayNum, currency),
      count: salesTodayAgg._count.id,
    },
    salesThisMonth: {
      amount: salesMonthNum,
      formatted: formatMoney(salesMonthNum, currency),
      count: salesMonthAgg._count.id,
    },
    totalSalesAllTime: {
      amount: totalSalesNum,
      formatted: formatMoney(totalSalesNum, currency),
      count: allSalesAgg._count.id,
    },
    expensesThisMonth: {
      amount: expensesMonthNum,
      formatted: formatMoney(expensesMonthNum, currency),
      count: expensesMonthAgg._count.id,
    },
    totalExpensesAllTime: {
      amount: totalExpensesNum,
      formatted: formatMoney(totalExpensesNum, currency),
      count: allExpensesAgg._count.id,
    },
    estimatedProfitThisMonth: {
      amount: estimatedMonthProfit,
      formatted: formatMoney(estimatedMonthProfit, currency),
    },
    inventorySummary: {
      totalProducts: productCount,
      lowStockCount: lowStockFiltered.length,
      lowStockItems: lowStockFiltered.map((p) => ({
        name: p.name,
        sku: p.sku,
        stock: p.stockQuantity,
        threshold: p.lowStockThreshold,
      })),
    },
    customerCount,
    outstandingInvoices: {
      count: outstandingInvoices._count.id,
      amount: outstandingInvoicesNum,
      formatted: formatMoney(outstandingInvoicesNum, currency),
    },
  };
}

/**
 * 2. get_sales
 */
export async function get_sales(
  params: SalesQueryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const dateRange = resolveDateRange(params.datePhrase, params.startDate, params.endDate);
  const limit = Math.min(Math.max(1, params.limit || 10), MAX_QUERY_LIMIT);
  const page = Math.max(1, params.page || 1);
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = {
    businessId,
  };

  if (dateRange.startDate || dateRange.endDate) {
    where.createdAt = {
      ...(dateRange.startDate ? { gte: dateRange.startDate } : {}),
      ...(dateRange.endDate ? { lte: dateRange.endDate } : {}),
    };
  }

  if (params.customerId) {
    where.customerId = params.customerId;
  } else if (params.customerName) {
    where.customer = {
      name: { contains: params.customerName, mode: "insensitive" },
    };
  }

  if (params.paymentMethod && Object.values(PaymentMethod).includes(params.paymentMethod)) {
    where.paymentMethod = params.paymentMethod;
  }

  const [sales, totalCount, aggregateTotal] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { totalAmount: true },
    }),
  ]);

  const totalSalesAmount = Number(aggregateTotal._sum.totalAmount?.toString() || 0);

  return {
    dateRangeDescription: dateRange.description,
    totalRecords: totalCount,
    page,
    limit,
    totalCompletedSalesAmount: totalSalesAmount,
    formattedTotalAmount: formatMoney(totalSalesAmount, currency),
    sales: sales.map((s) => ({
      id: s.id,
      date: s.createdAt.toISOString().split("T")[0],
      customer: s.customer?.name || "Walk-in Customer",
      totalAmount: Number(s.totalAmount.toString()),
      formattedAmount: formatMoney(s.totalAmount.toString(), currency),
      paymentMethod: s.paymentMethod,
      status: s.status,
      itemsCount: s.items.length,
      itemsSummary: s.items.map((i) => `${i.product.name} (x${i.quantity})`).join(", "),
    })),
  };
}

/**
 * 3. get_top_products
 */
export async function get_top_products(
  params: TopProductsParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const dateRange = resolveDateRange(params.datePhrase, params.startDate, params.endDate);
  const limit = Math.min(Math.max(1, params.limit || 5), 20);

  const whereSale: Record<string, unknown> = {
    businessId,
    status: "COMPLETED",
  };

  if (dateRange.startDate || dateRange.endDate) {
    whereSale.createdAt = {
      ...(dateRange.startDate ? { gte: dateRange.startDate } : {}),
      ...(dateRange.endDate ? { lte: dateRange.endDate } : {}),
    };
  }

  // Find sale items grouped by product
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: whereSale,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          costPrice: true,
          stockQuantity: true,
        },
      },
    },
  });

  // Group and accumulate quantities & revenue
  const productAggMap: Record<
    string,
    {
      productId: string;
      name: string;
      sku: string;
      stockQuantity: number;
      unitsSold: number;
      revenue: number;
    }
  > = {};

  saleItems.forEach((item) => {
    const p = item.product;
    if (!productAggMap[p.id]) {
      productAggMap[p.id] = {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
        unitsSold: 0,
        revenue: 0,
      };
    }
    productAggMap[p.id].unitsSold += item.quantity;
    productAggMap[p.id].revenue += Number(item.totalAmount.toString());
  });

  const sortedProducts = Object.values(productAggMap)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit)
    .map((p, index) => ({
      rank: index + 1,
      ...p,
      formattedRevenue: formatMoney(p.revenue, currency),
    }));

  return {
    dateRangeDescription: dateRange.description,
    topProductsCount: sortedProducts.length,
    topProducts: sortedProducts,
  };
}

/**
 * 4. get_low_stock_products
 */
export async function get_low_stock_products(
  params: LowStockParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const limit = Math.min(Math.max(1, params.limit || 20), MAX_QUERY_LIMIT);

  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { stockQuantity: "asc" },
  });

  const lowStock = products
    .filter((p) => p.stockQuantity <= p.lowStockThreshold)
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      sellingPrice: formatMoney(p.sellingPrice.toString(), currency),
      costPrice: formatMoney(p.costPrice.toString(), currency),
      reorderNeeded: Math.max(0, p.lowStockThreshold * 2 - p.stockQuantity),
    }));

  return {
    totalLowStockItems: lowStock.length,
    lowStockProducts: lowStock,
  };
}

/**
 * 5. get_customers
 */
export async function get_customers(
  params: CustomersQueryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const limit = Math.min(Math.max(1, params.limit || 10), MAX_QUERY_LIMIT);
  const page = Math.max(1, params.page || 1);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { businessId };

  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
    ];
  }

  const [customers, totalCount] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        sales: {
          where: { status: "COMPLETED" },
          select: { totalAmount: true },
        },
        _count: {
          select: { sales: true, invoices: true },
        },
      },
      orderBy: { name: "asc" },
      take: limit,
      skip,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    totalCustomers: totalCount,
    page,
    limit,
    customers: customers.map((c) => {
      const totalSpent = c.sales.reduce(
        (sum, s) => sum + Number(s.totalAmount.toString()),
        0
      );
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        totalPurchasesCount: c._count.sales,
        invoicesCount: c._count.invoices,
        lifetimeSpent: totalSpent,
        formattedLifetimeSpent: formatMoney(totalSpent, currency),
      };
    }),
  };
}

/**
 * 6. get_customer_summary
 */
export async function get_customer_summary(
  params: CustomerSummaryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const where: Record<string, unknown> = { businessId };

  if (params.customerId) {
    where.id = params.customerId;
  } else if (params.phone) {
    where.phone = params.phone.trim();
  } else if (params.customerName) {
    where.name = { contains: params.customerName.trim(), mode: "insensitive" };
  } else {
    return { error: "Please specify a customer name, ID, or phone number to look up." };
  }

  const customer = await prisma.customer.findFirst({
    where,
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    return { error: "Customer not found in this business." };
  }

  const completedSales = customer.sales.filter((s) => s.status === "COMPLETED");
  const lifetimeSpent = completedSales.reduce(
    (sum, s) => sum + Number(s.totalAmount.toString()),
    0
  );

  const unpaidInvoices = customer.invoices.filter((i) =>
    ["SENT", "OVERDUE"].includes(i.status)
  );
  const unpaidInvoicesAmount = unpaidInvoices.reduce(
    (sum, i) => sum + Number(i.total.toString()),
    0
  );

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      createdAt: customer.createdAt.toISOString().split("T")[0],
    },
    lifetimeSalesAmount: lifetimeSpent,
    formattedLifetimeSales: formatMoney(lifetimeSpent, currency),
    totalSalesCount: customer.sales.length,
    invoicesCount: customer.invoices.length,
    outstandingInvoicesCount: unpaidInvoices.length,
    outstandingBalance: unpaidInvoicesAmount,
    formattedOutstandingBalance: formatMoney(unpaidInvoicesAmount, currency),
    recentTransactions: customer.sales.map((s) => ({
      id: s.id,
      date: s.createdAt.toISOString().split("T")[0],
      amount: formatMoney(s.totalAmount.toString(), currency),
      status: s.status,
      paymentMethod: s.paymentMethod,
      items: s.items.map((i) => `${i.product.name} (x${i.quantity})`).join(", "),
    })),
  };
}

/**
 * 7. get_expenses
 */
export async function get_expenses(
  params: ExpensesQueryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const dateRange = resolveDateRange(params.datePhrase, params.startDate, params.endDate);
  const limit = Math.min(Math.max(1, params.limit || 10), MAX_QUERY_LIMIT);
  const page = Math.max(1, params.page || 1);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { businessId };

  if (dateRange.startDate || dateRange.endDate) {
    where.createdAt = {
      ...(dateRange.startDate ? { gte: dateRange.startDate } : {}),
      ...(dateRange.endDate ? { lte: dateRange.endDate } : {}),
    };
  }

  if (params.category && params.category.trim() && params.category !== "ALL") {
    where.category = { contains: params.category.trim(), mode: "insensitive" };
  }

  const [expenses, totalCount, allMatchingExpenses] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      select: { category: true, amount: true },
    }),
  ]);

  // Aggregate category spend
  const categoryTotals: Record<string, number> = {};
  let totalSpend = 0;
  allMatchingExpenses.forEach((e) => {
    const amt = Number(e.amount.toString());
    totalSpend += amt;
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;
  });

  return {
    dateRangeDescription: dateRange.description,
    totalExpensesCount: totalCount,
    totalSpent: totalSpend,
    formattedTotalSpent: formatMoney(totalSpend, currency),
    categoryBreakdown: Object.entries(categoryTotals).map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      formattedAmount: formatMoney(amt, currency),
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: Number(e.amount.toString()),
      formattedAmount: formatMoney(e.amount.toString(), currency),
      date: e.createdAt.toISOString().split("T")[0],
    })),
  };
}

/**
 * 8. get_invoices
 */
export async function get_invoices(
  params: InvoicesQueryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const dateRange = resolveDateRange(params.datePhrase, params.startDate, params.endDate);
  const limit = Math.min(Math.max(1, params.limit || 10), MAX_QUERY_LIMIT);
  const page = Math.max(1, params.page || 1);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { businessId };

  if (dateRange.startDate || dateRange.endDate) {
    where.createdAt = {
      ...(dateRange.startDate ? { gte: dateRange.startDate } : {}),
      ...(dateRange.endDate ? { lte: dateRange.endDate } : {}),
    };
  }

  if (params.status && Object.values(InvoiceStatus).includes(params.status)) {
    where.status = params.status;
  }

  if (params.customerId) {
    where.customerId = params.customerId;
  }

  const [invoices, totalCount, allMatching] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      select: { status: true, total: true },
    }),
  ]);

  let totalAmount = 0;
  let unpaidAmount = 0;
  const statusCounts: Record<string, number> = {};

  allMatching.forEach((i) => {
    const amt = Number(i.total.toString());
    totalAmount += amt;
    statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
    if (["SENT", "OVERDUE"].includes(i.status)) {
      unpaidAmount += amt;
    }
  });

  return {
    dateRangeDescription: dateRange.description,
    totalInvoicesCount: totalCount,
    totalAmount,
    formattedTotalAmount: formatMoney(totalAmount, currency),
    unpaidAmount,
    formattedUnpaidAmount: formatMoney(unpaidAmount, currency),
    statusCounts,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer.name,
      status: inv.status,
      total: Number(inv.total.toString()),
      formattedTotal: formatMoney(inv.total.toString(), currency),
      dueDate: inv.dueDate.toISOString().split("T")[0],
      createdAt: inv.createdAt.toISOString().split("T")[0],
    })),
  };
}

/**
 * 9. get_product
 */
export async function get_product(
  params: ProductQueryParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const where: Record<string, unknown> = { businessId };

  if (params.productId) {
    where.id = params.productId;
  } else if (params.sku) {
    where.sku = params.sku.trim().toUpperCase();
  } else if (params.barcode) {
    where.barcode = params.barcode.trim();
  } else if (params.name) {
    where.name = { contains: params.name.trim(), mode: "insensitive" };
  } else {
    return { error: "Please provide a product name, SKU, barcode, or ID to look up." };
  }

  const product = await prisma.product.findFirst({
    where,
    include: {
      saleItems: {
        where: { sale: { status: "COMPLETED" } },
        select: { quantity: true, totalAmount: true },
      },
    },
  });

  if (!product) {
    return { error: "Product not found in this business." };
  }

  const totalSoldUnits = product.saleItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalRevenue = product.saleItems.reduce(
    (sum, item) => sum + Number(item.totalAmount.toString()),
    0
  );

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    sellingPrice: Number(product.sellingPrice.toString()),
    formattedSellingPrice: formatMoney(product.sellingPrice.toString(), currency),
    costPrice: Number(product.costPrice.toString()),
    formattedCostPrice: formatMoney(product.costPrice.toString(), currency),
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    isLowStock: product.stockQuantity <= product.lowStockThreshold,
    totalUnitsSold: totalSoldUnits,
    totalRevenueGenerated: formatMoney(totalRevenue, currency),
  };
}

/**
 * 10. get_business_brief
 * Generates an executive Business Brief combining health metrics,
 * Needs Attention operational flags, and grounded recommendations.
 */
export async function get_business_brief(
  _params: Record<string, unknown>,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const brief = await generateBusinessBrief(membership.business.id, {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
  });

  return {
    success: true,
    data: brief,
    formatted: brief.formattedSummary,
  };
}

/**
 * 11. get_needs_attention
 * Retrieves prioritized operational alerts requiring owner attention.
 */
export async function get_needs_attention(
  _params: Record<string, unknown>,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const health = await calculateBusinessHealth(membership.business.id);
  const attention = evaluateNeedsAttention(health, {
    businessId: membership.business.id,
    businessName: membership.business.name,
    currency: membership.business.currency,
  });
  const recommendations = generateRecommendations(attention, health);

  return {
    success: true,
    data: {
      attentionCount: attention.length,
      items: attention,
      recommendations,
    },
  };
}

/**
 * 12. get_daily_action_plan
 */
export async function get_daily_action_plan(
  _params: Record<string, unknown>,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const autopilot = await evaluateBusinessAutopilot(membership.business.id);
  return {
    success: true,
    data: autopilot.actionPlan,
  };
}

/**
 * 13. get_morning_brief
 */
export async function get_morning_brief(
  _params: Record<string, unknown>,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const autopilot = await evaluateBusinessAutopilot(membership.business.id);
  return {
    success: true,
    data: autopilot.morningBrief,
  };
}

/**
 * Tool metadata and JSON schemas for LLM function calling
 */
export const BIZPILOT_AI_TOOLS: ToolDefinition[] = [
  {
    name: "get_daily_action_plan",
    description:
      "Get today's prioritized 5-point Business Action Plan with operational alerts, stockout warnings, receivables tasks, and commercial opportunities.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_morning_brief",
    description:
      "Generate the official Morning Business Briefing containing financial health, 3 key things to know today, top priorities, and growth opportunities.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_business_brief",
    description:
      "Generate an executive business brief including real-time sales, expenses, profit margin, operational issues needing attention, and recommended next actions.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_needs_attention",
    description:
      "Identify urgent operational matters needing owner attention such as stockouts, low inventory, overdue invoices, and expense spikes.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_business_summary",
    description:
      "Get a high-level executive financial and operational overview of the active business (sales today, sales this month, all-time sales, expenses, net profit margin, stock shortage count, customer count, outstanding unpaid invoices).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_sales",
    description:
      "Query sales transaction history, revenue totals, payment methods, and breakdown for a specific date range, customer, or payment method.",
    parameters: {
      type: "object",
      properties: {
        datePhrase: {
          type: "string",
          description: "Natural date phrase: today, yesterday, this_week, this_month, last_month, last_7_days, last_30_days",
        },
        startDate: { type: "string", description: "ISO start date string (e.g. 2026-08-01)" },
        endDate: { type: "string", description: "ISO end date string (e.g. 2026-08-31)" },
        customerName: { type: "string", description: "Name of customer to filter sales for" },
        paymentMethod: {
          type: "string",
          description: "Payment method filter",
          enum: ["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"],
        },
        limit: { type: "number", description: "Maximum records to return (default 10, max 50)" },
      },
    },
  },
  {
    name: "get_top_products",
    description:
      "Get ranking of top-selling products by quantity sold and revenue generated for a specified period.",
    parameters: {
      type: "object",
      properties: {
        datePhrase: {
          type: "string",
          description: "Date phrase: today, yesterday, this_week, this_month, last_month, last_30_days",
        },
        startDate: { type: "string", description: "ISO start date" },
        endDate: { type: "string", description: "ISO end date" },
        limit: { type: "number", description: "Number of top products to retrieve (default 5, max 20)" },
      },
    },
  },
  {
    name: "get_low_stock_products",
    description:
      "Retrieve all catalog products whose current stock quantity is less than or equal to their low stock alert threshold.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum products to return (default 20, max 50)" },
      },
    },
  },
  {
    name: "get_customers",
    description:
      "Search and list registered business customers along with their lifetime purchase counts and total spend.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search query for customer name, phone, or email" },
        limit: { type: "number", description: "Number of customers to return (default 10, max 50)" },
      },
    },
  },
  {
    name: "get_customer_summary",
    description:
      "Get complete profile and transaction summary for a specific customer including lifetime purchases, unpaid invoices, and recent orders.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Customer name or partial name" },
        phone: { type: "string", description: "Customer phone number" },
        customerId: { type: "string", description: "Unique customer ID" },
      },
    },
  },
  {
    name: "get_expenses",
    description:
      "Retrieve operating expense records and category spending breakdown for a date range or category.",
    parameters: {
      type: "object",
      properties: {
        datePhrase: {
          type: "string",
          description: "Date phrase: today, yesterday, this_week, this_month, last_month, last_30_days",
        },
        category: { type: "string", description: "Expense category: Rent, Utilities, Supplies, Marketing, Salaries, Transport, etc." },
        limit: { type: "number", description: "Maximum records to return (default 10, max 50)" },
      },
    },
  },
  {
    name: "get_invoices",
    description:
      "Query customer invoices, payment statuses (PAID, SENT, OVERDUE, DRAFT), and unpaid outstanding receivables.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: DRAFT, SENT, PAID, OVERDUE, CANCELLED",
          enum: ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"],
        },
        datePhrase: { type: "string", description: "Date phrase: this_month, last_month, last_30_days" },
        limit: { type: "number", description: "Maximum invoices to return (default 10, max 50)" },
      },
    },
  },
  {
    name: "get_product",
    description:
      "Look up a single product's exact inventory level, selling price, cost price, SKU, and lifetime sales by name or SKU.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name to search for" },
        sku: { type: "string", description: "Exact product SKU" },
        barcode: { type: "string", description: "Product barcode" },
      },
    },
  },
];

