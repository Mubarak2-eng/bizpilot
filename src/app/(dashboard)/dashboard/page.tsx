import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { evaluateBusinessAutopilot } from "@/lib/autopilot";
import DashboardOverview from "@/components/dashboard-overview";

export const metadata = {
  title: "Dashboard | BizPilot AI",
  description: "BizPilot AI Business Operating System & Autopilot Overview",
};

export default async function DashboardPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const businessId = activeContext.business.id;

  // Date boundaries for today and this month
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Parallel database queries scoped strictly by active businessId
  const [
    salesAggregate,
    salesTodayAggregate,
    salesThisMonthAggregate,
    expensesAggregate,
    productCount,
    customerCount,
    outstandingInvoices,
    lowStockProducts,
    recentSalesData,
    autopilotData,
  ] = await Promise.all([
    // Total Completed Sales
    prisma.sale.aggregate({
      where: { businessId, status: "COMPLETED" },
      _sum: { totalAmount: true },
    }),
    // Sales Today
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: startOfDay },
      },
      _sum: { totalAmount: true },
    }),
    // Sales This Month
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
    }),
    // Total Expenses
    prisma.expense.aggregate({
      where: { businessId },
      _sum: { amount: true },
    }),
    // Total Products
    prisma.product.count({ where: { businessId } }),
    // Total Customers
    prisma.customer.count({ where: { businessId } }),
    // Outstanding Invoices (SENT or OVERDUE)
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["SENT", "OVERDUE"] },
      },
      select: { total: true },
    }),
    // All products to evaluate low stock
    prisma.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        lowStockThreshold: true,
      },
    }),
    // Recent 6 sales with customer details
    prisma.sale.findMany({
      where: { businessId },
      include: {
        customer: { select: { name: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    // Autopilot Engine evaluation
    evaluateBusinessAutopilot(businessId),
  ]);

  const totalSalesNum = Number(salesAggregate._sum.totalAmount?.toString() || "0");
  const salesTodayNum = Number(salesTodayAggregate._sum.totalAmount?.toString() || "0");
  const salesThisMonthNum = Number(salesThisMonthAggregate._sum.totalAmount?.toString() || "0");
  const totalExpensesNum = Number(expensesAggregate._sum.amount?.toString() || "0");
  const netProfitNum = totalSalesNum - totalExpensesNum;

  const outstandingInvoicesCount = outstandingInvoices.length;
  const outstandingInvoicesAmount = outstandingInvoices.reduce(
    (sum, inv) => sum + Number(inv.total.toString()),
    0
  );

  const lowStockItems = lowStockProducts.filter(
    (p) => p.stockQuantity <= p.lowStockThreshold
  );

  const formattedRecentSales = recentSalesData.map((s) => ({
    id: s.id,
    totalAmount: s.totalAmount.toString(),
    paymentMethod: s.paymentMethod,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    customerName: s.customer?.name || null,
    itemCount: s.items.length,
  }));

  return (
    <DashboardOverview
      business={activeContext.business}
      role={activeContext.role}
      stats={{
        totalSales: totalSalesNum,
        salesToday: salesTodayNum,
        salesThisMonth: salesThisMonthNum,
        totalExpenses: totalExpensesNum,
        netProfit: netProfitNum,
        productCount,
        lowStockCount: lowStockItems.length,
        customerCount,
        outstandingInvoicesCount,
        outstandingInvoicesAmount,
      }}
      lowStockItems={lowStockItems}
      recentSales={formattedRecentSales}
      actionPlan={autopilotData.actionPlan}
      opportunities={autopilotData.opportunities}
    />
  );
}
