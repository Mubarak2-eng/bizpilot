import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import SalesManager, { SaleRecord, CatalogProduct, CustomerOption } from "@/components/sales-manager";

export const metadata = {
  title: "Sales & POS | BizPilot AI",
  description: "Record point-of-sale transactions and view sales history",
};

export default async function SalesPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const businessId = activeContext.business.id;

  const [salesData, productsData, customersData] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
        creditPayments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        stockQuantity: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { businessId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const formattedSales: SaleRecord[] = salesData.map((s) => ({
    id: s.id,
    totalAmount: s.totalAmount.toString(),
    amountPaid: s.amountPaid.toString(),
    outstandingBalance: s.outstandingBalance.toString(),
    isCredit: s.isCredit,
    creditStatus: s.creditStatus,
    creditDueDate: s.creditDueDate ? s.creditDueDate.toISOString() : null,
    paymentMethod: s.paymentMethod,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    customer: s.customer,
    items: s.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toString(),
      totalAmount: i.totalAmount.toString(),
    })),
    creditPayments: s.creditPayments.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      paymentMethod: p.paymentMethod,
      note: p.note,
      recordedBy: p.recordedBy,
      createdAt: p.createdAt.toISOString(),
    })),
  }));

  const formattedProducts: CatalogProduct[] = productsData.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    sellingPrice: p.sellingPrice.toString(),
    stockQuantity: p.stockQuantity,
  }));

  const formattedCustomers: CustomerOption[] = customersData.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <SalesManager
      business={activeContext.business}
      role={activeContext.role}
      sales={formattedSales}
      products={formattedProducts}
      customers={formattedCustomers}
    />
  );
}
