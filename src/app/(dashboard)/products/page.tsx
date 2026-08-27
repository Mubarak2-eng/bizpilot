import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import ProductsManager, { ProductItem } from "@/components/products-manager";

export const metadata = {
  title: "Products & Inventory | BizPilot AI",
  description: "Manage product catalog, prices, and inventory levels",
};

export default async function ProductsPage() {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const products = await prisma.product.findMany({
    where: { businessId: activeContext.business.id },
    orderBy: { createdAt: "desc" },
  });

  const formattedProducts: ProductItem[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    description: p.description,
    sellingPrice: p.sellingPrice.toString(),
    costPrice: p.costPrice.toString(),
    stockQuantity: p.stockQuantity,
    lowStockThreshold: p.lowStockThreshold,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <ProductsManager
      business={activeContext.business}
      role={activeContext.role}
      products={formattedProducts}
    />
  );
}
