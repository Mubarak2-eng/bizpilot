import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import CustomersManager, { CustomerItem } from "@/components/customers-manager";

export const metadata = {
  title: "Customers Directory & Debt Ledger | BizPilot AI",
  description: "Manage client directory, customer debt balances, and payment relationships",
};

export default async function CustomersPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const customers = await prisma.customer.findMany({
    where: { businessId: activeContext.business.id },
    include: {
      sales: {
        where: {
          status: { notIn: ["CANCELLED", "REFUNDED"] },
        },
        include: {
          creditPayments: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          sales: true,
          invoices: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  const formattedCustomers: CustomerItem[] = customers.map((c) => {
    let totalPurchases = 0;
    let totalPaid = 0;
    let outstandingBalance = 0;
    let creditSalesCount = 0;
    let overdueAmount = 0;

    const creditSales = [];

    for (const s of c.sales) {
      const tot = Number(s.totalAmount.toString());
      const paid = Number(s.amountPaid.toString());
      const bal = Number(s.outstandingBalance.toString());

      totalPurchases += tot;
      totalPaid += paid;

      if (s.isCredit) {
        creditSalesCount++;
        outstandingBalance += bal;

        const isOverdue = bal > 0 && s.creditDueDate && s.creditDueDate < now;
        if (isOverdue) {
          overdueAmount += bal;
        }

        creditSales.push({
          id: s.id,
          totalAmount: s.totalAmount.toString(),
          amountPaid: s.amountPaid.toString(),
          outstandingBalance: s.outstandingBalance.toString(),
          creditStatus: s.creditStatus,
          creditDueDate: s.creditDueDate ? s.creditDueDate.toISOString() : null,
          createdAt: s.createdAt.toISOString(),
          payments: s.creditPayments.map((p) => ({
            id: p.id,
            amount: p.amount.toString(),
            paymentMethod: p.paymentMethod,
            note: p.note,
            createdAt: p.createdAt.toISOString(),
          })),
        });
      }
    }

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      salesCount: c._count.sales,
      totalSpent: totalPurchases.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      creditSalesCount,
      overdueAmount: overdueAmount.toFixed(2),
      invoicesCount: c._count.invoices,
      createdAt: c.createdAt.toISOString(),
      creditSales,
    };
  });

  const campaigns = await prisma.customerCampaign.findMany({
    where: { businessId: activeContext.business.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const formattedCampaigns = campaigns.map((c) => ({
    id: c.id,
    subject: c.subject,
    body: c.body,
    status: c.status,
    recipientCount: c.recipientCount,
    sentCount: c.sentCount,
    failedCount: c.failedCount,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  }));

  return (
    <CustomersManager
      business={activeContext.business}
      role={activeContext.role}
      customers={formattedCustomers}
      initialCampaigns={formattedCampaigns}
    />
  );
}
