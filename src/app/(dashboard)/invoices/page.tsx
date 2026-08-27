import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import InvoicesManager, { InvoiceRecord, CustomerOption, CatalogProduct } from "@/components/invoices-manager";

export const metadata = {
  title: "Invoices & Billing | BizPilot AI",
  description: "Create and track customer invoices, payment statuses, and taxes",
};

export default async function InvoicesPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const businessId = activeContext.business.id;

  const [invoicesData, customersData, productsData] = await Promise.all([
    prisma.invoice.findMany({
      where: { businessId },
      include: {
        customer: true,
        items: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const formattedInvoices: InvoiceRecord[] = invoicesData.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    subtotal: inv.subtotal.toString(),
    tax: inv.tax.toString(),
    total: inv.total.toString(),
    dueDate: inv.dueDate.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    customer: {
      id: inv.customer.id,
      name: inv.customer.name,
      email: inv.customer.email,
      phone: inv.customer.phone,
      address: inv.customer.address,
    },
    items: inv.items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toString(),
      totalAmount: i.totalAmount.toString(),
    })),
  }));

  const formattedCustomers: CustomerOption[] = customersData.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
  }));

  const formattedProducts: CatalogProduct[] = productsData.map((p) => ({
    id: p.id,
    name: p.name,
    sellingPrice: p.sellingPrice.toString(),
  }));

  return (
    <InvoicesManager
      business={activeContext.business}
      role={activeContext.role}
      invoices={formattedInvoices}
      customers={formattedCustomers}
      products={formattedProducts}
    />
  );
}
