"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { PaymentMethod, SaleStatus } from "@prisma/client";
import { Role } from "@/types/auth";
import { toDecimalString } from "@/lib/money";

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number | string; // Optional custom price, else default to product's catalog price
}

export interface CreateSaleInput {
  customerId?: string | null;
  paymentMethod: PaymentMethod;
  status?: SaleStatus;
  items: SaleItemInput[];
}

export interface SaleActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  saleId?: string;
}

/**
 * Records a new Sale atomically in a Prisma database transaction.
 *
 * Security & Integrity Guarantees:
 * - Scoped strictly to the active business context.
 * - Product IDs are validated to belong to the business.
 * - Stock quantity is checked before decrementing.
 * - Line totals and total sale amount are calculated SERVER-SIDE using Decimal arithmetic.
 * - Client-supplied totals are never accepted.
 */
export async function createSaleAction(
  businessId: string,
  input: CreateSaleInput
): Promise<SaleActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    if (!input.items || input.items.length === 0) {
      return { error: "At least one product item is required to record a sale." };
    }

    if (!["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"].includes(input.paymentMethod)) {
      return { error: "Invalid payment method selected." };
    }

    const saleStatus: SaleStatus = input.status || "COMPLETED";

    // Validate optional customer belongs to business
    if (input.customerId) {
      const customerExists = await prisma.customer.findFirst({
        where: {
          id: input.customerId,
          businessId: context.business.id,
        },
      });
      if (!customerExists) {
        return { error: "Selected customer does not belong to this business." };
      }
    }

    // Execute atomic transaction for inventory check, stock reduction, and sale creation
    const createdSale = await prisma.$transaction(async (tx) => {
      let totalAmountNum = 0;
      const verifiedItems: {
        productId: string;
        quantity: number;
        unitPrice: string;
        totalAmount: string;
      }[] = [];

      for (const item of input.items) {
        const qty = parseInt(String(item.quantity), 10);
        if (isNaN(qty) || qty <= 0) {
          throw new Error("Item quantity must be a positive number.");
        }

        // Fetch product and lock/verify business ownership
        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            businessId: context.business.id,
          },
        });

        if (!product) {
          throw new Error(`Product with ID "${item.productId}" not found in business catalog.`);
        }

        // For COMPLETED sales, check available stock and decrement
        if (saleStatus === "COMPLETED") {
          if (product.stockQuantity < qty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Available: ${product.stockQuantity}, Requested: ${qty}.`
            );
          }

          // Decrement stock
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQuantity: {
                decrement: qty,
              },
            },
          });
        }

        // Determine price: either valid custom price or catalog sellingPrice
        const unitPriceNum = item.unitPrice !== undefined && item.unitPrice !== null && !isNaN(Number(item.unitPrice)) && Number(item.unitPrice) >= 0
          ? Number(item.unitPrice)
          : Number(product.sellingPrice.toString());

        const lineTotalNum = unitPriceNum * qty;
        totalAmountNum += lineTotalNum;

        verifiedItems.push({
          productId: product.id,
          quantity: qty,
          unitPrice: toDecimalString(unitPriceNum),
          totalAmount: toDecimalString(lineTotalNum),
        });
      }

      // Create Sale with items in DB
      const sale = await tx.sale.create({
        data: {
          businessId: context.business.id,
          customerId: input.customerId || null,
          totalAmount: toDecimalString(totalAmountNum),
          paymentMethod: input.paymentMethod,
          status: saleStatus,
          items: {
            create: verifiedItems.map((v) => ({
              productId: v.productId,
              quantity: v.quantity,
              unitPrice: v.unitPrice,
              totalAmount: v.totalAmount,
            })),
          },
        },
      });

      return sale;
    });

    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      success: true,
      message: `Sale recorded successfully! Total: ${context.business.currency} ${createdSale.totalAmount}`,
      saleId: createdSale.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record sale.";
    return { error: message };
  }
}

/**
 * Cancels or refunds a sale. If the sale was COMPLETED, restores the stock back to products.
 * Requires ADMIN or OWNER role.
 */
export async function cancelSaleAction(
  businessId: string,
  saleId: string,
  newStatus: "CANCELLED" | "REFUNDED" = "CANCELLED"
): Promise<SaleActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        businessId: context.business.id,
      },
      include: {
        items: true,
      },
    });

    if (!sale) {
      return { error: "Sale not found or does not belong to this business." };
    }

    if (sale.status === "CANCELLED" || sale.status === "REFUNDED") {
      return { error: `Sale is already ${sale.status.toLowerCase()}.` };
    }

    await prisma.$transaction(async (tx) => {
      // If sale was completed, restore the product inventory
      if (sale.status === "COMPLETED") {
        for (const item of sale.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: newStatus,
        },
      });
    });

    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      success: true,
      message: `Sale marked as ${newStatus.toLowerCase()} and stock restored.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel sale.";
    return { error: message };
  }
}
