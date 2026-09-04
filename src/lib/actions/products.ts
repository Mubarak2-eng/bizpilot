"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";
import { toDecimalString } from "@/lib/money";

export interface ProductActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  productId?: string;
}

/**
 * Creates a new product scoped to the active business.
 * Validates SKU and optional Barcode uniqueness per business.
 */
export async function createProductAction(
  businessId: string,
  formData: FormData
): Promise<ProductActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const name = formData.get("name")?.toString().trim();
    const sku = formData.get("sku")?.toString().trim().toUpperCase();
    const barcode = formData.get("barcode")?.toString().trim() || null;
    const description = formData.get("description")?.toString().trim() || null;
    const sellingPriceRaw = formData.get("sellingPrice")?.toString().trim();
    const costPriceRaw = formData.get("costPrice")?.toString().trim() || "0";
    const stockQuantityRaw = formData.get("stockQuantity")?.toString().trim() || "0";
    const lowStockThresholdRaw = formData.get("lowStockThreshold")?.toString().trim() || "10";

    if (!name || name.length < 2) {
      return { error: "Product name is required (at least 2 characters)." };
    }

    if (!sku || sku.length < 2) {
      return { error: "Product SKU is required (at least 2 characters)." };
    }

    const sellingPrice = parseFloat(sellingPriceRaw || "0");
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return { error: "Selling price must be a valid positive number." };
    }

    const costPrice = parseFloat(costPriceRaw);
    if (isNaN(costPrice) || costPrice < 0) {
      return { error: "Cost price must be a valid positive number." };
    }

    const stockQuantity = parseInt(stockQuantityRaw, 10);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock quantity must be a non-negative integer." };
    }

    const lowStockThreshold = parseInt(lowStockThresholdRaw, 10);
    if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
      return { error: "Low stock threshold must be a non-negative integer." };
    }

    // Check SKU uniqueness within active business
    const existingSku = await prisma.product.findUnique({
      where: {
        businessId_sku: {
          businessId: context.business.id,
          sku,
        },
      },
    });

    if (existingSku) {
      return { error: `A product with SKU "${sku}" already exists in this business.` };
    }

    // Check Barcode uniqueness if barcode provided
    if (barcode) {
      const existingBarcode = await prisma.product.findUnique({
        where: {
          businessId_barcode: {
            businessId: context.business.id,
            barcode,
          },
        },
      });

      if (existingBarcode) {
        return { error: `A product with barcode "${barcode}" already exists in this business.` };
      }
    }

    const newProduct = await prisma.product.create({
      data: {
        businessId: context.business.id,
        name,
        sku,
        barcode,
        description,
        sellingPrice: toDecimalString(sellingPrice),
        costPrice: toDecimalString(costPrice),
        stockQuantity,
        lowStockThreshold,
      },
    });

    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Product "${name}" added to catalog successfully.`,
      productId: newProduct.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create product.";
    return { error: message };
  }
}

/**
 * Updates an existing product scoped to the active business.
 */
export async function updateProductAction(
  businessId: string,
  productId: string,
  formData: FormData
): Promise<ProductActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    // Verify product exists and belongs to active business
    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Product not found or does not belong to this business." };
    }

    const name = formData.get("name")?.toString().trim();
    const sku = formData.get("sku")?.toString().trim().toUpperCase();
    const barcode = formData.get("barcode")?.toString().trim() || null;
    const description = formData.get("description")?.toString().trim() || null;
    const sellingPriceRaw = formData.get("sellingPrice")?.toString().trim();
    const costPriceRaw = formData.get("costPrice")?.toString().trim() || "0";
    const stockQuantityRaw = formData.get("stockQuantity")?.toString().trim() || "0";
    const lowStockThresholdRaw = formData.get("lowStockThreshold")?.toString().trim() || "10";

    if (!name || name.length < 2) {
      return { error: "Product name is required (at least 2 characters)." };
    }

    if (!sku || sku.length < 2) {
      return { error: "Product SKU is required." };
    }

    const sellingPrice = parseFloat(sellingPriceRaw || "0");
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      return { error: "Selling price must be a valid positive number." };
    }

    const costPrice = parseFloat(costPriceRaw);
    if (isNaN(costPrice) || costPrice < 0) {
      return { error: "Cost price must be a valid positive number." };
    }

    const stockQuantity = parseInt(stockQuantityRaw, 10);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock quantity must be a non-negative integer." };
    }

    const lowStockThreshold = parseInt(lowStockThresholdRaw, 10);
    if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
      return { error: "Low stock threshold must be a non-negative integer." };
    }

    // Check SKU collision with other products in business
    if (sku !== existing.sku) {
      const existingSku = await prisma.product.findUnique({
        where: {
          businessId_sku: {
            businessId: context.business.id,
            sku,
          },
        },
      });

      if (existingSku && existingSku.id !== productId) {
        return { error: `Another product with SKU "${sku}" already exists.` };
      }
    }

    // Check Barcode collision
    if (barcode && barcode !== existing.barcode) {
      const existingBarcode = await prisma.product.findUnique({
        where: {
          businessId_barcode: {
            businessId: context.business.id,
            barcode,
          },
        },
      });

      if (existingBarcode && existingBarcode.id !== productId) {
        return { error: `Another product with barcode "${barcode}" already exists.` };
      }
    }

    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name,
        sku,
        barcode,
        description,
        sellingPrice: toDecimalString(sellingPrice),
        costPrice: toDecimalString(costPrice),
        stockQuantity,
        lowStockThreshold,
      },
    });

    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Product "${name}" updated successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update product.";
    return { error: message };
  }
}

/**
 * Deletes a product from the active business catalog.
 * Requires ADMIN or OWNER role.
 */
export async function deleteProductAction(
  businessId: string,
  productId: string
): Promise<ProductActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const existing = await prisma.product.findFirst({
      where: {
        id: productId,
        businessId: context.business.id,
      },
      include: {
        _count: {
          select: {
            saleItems: true,
            invoiceItems: true,
          },
        },
      },
    });

    if (!existing) {
      return { error: "Product not found or does not belong to this business." };
    }

    if (existing._count.saleItems > 0 || existing._count.invoiceItems > 0) {
      return {
        error: `Cannot delete "${existing.name}" because it is linked to recorded sales or invoices. You may set its stock to 0 instead.`,
      };
    }

    await prisma.product.delete({
      where: { id: existing.id },
    });

    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/sales");
    revalidatePath("/invoices");

    return {
      success: true,
      message: `Product "${existing.name}" deleted successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete product.";
    return { error: message };
  }
}
