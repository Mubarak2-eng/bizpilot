import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import CustomersManager, { CustomerItem } from "@/components/customers-manager";

export const metadata = {
  title: "Customers Directory | BizPilot AI",
  description: "Manage client directory and customer relationships",
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
        where: { status: "COMPLETED" },
        select: { totalAmount: true },
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

  const formattedCustomers: CustomerItem[] = customers.map((c) => {
    const totalSpent = c.sales.reduce(
      (acc, s) => acc + Number(s.totalAmount.toString()),
      0
    );

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      salesCount: c._count.sales,
      totalSpent: totalSpent.toFixed(2),
      invoicesCount: c._count.invoices,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return (
    <CustomersManager
      business={activeContext.business}
      role={activeContext.role}
      customers={formattedCustomers}
    />
  );
}
