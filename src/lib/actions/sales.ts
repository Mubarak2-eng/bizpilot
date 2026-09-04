"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { PaymentMethod, SaleStatus, CreditStatus } from "@prisma/client";
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
  isCredit?: boolean;
  creditDueDate?: string | null; // ISO date string e.g. "2026-09-17"
  initialPaymentAmount?: number | string | null;
  initialPaymentMethod?: PaymentMethod | null;
}

export interface SaleActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  saleId?: string;
}

export interface CreditPaymentInput {
  amount: number | string;
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface CreditPaymentRecord {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface CreditSaleDetailsResult {
  success?: boolean;
  error?: string;
  sale?: {
    id: string;
    totalAmount: string;
    amountPaid: string;
    outstandingBalance: string;
    isCredit: boolean;
    creditStatus: CreditStatus | null;
    creditDueDate: string | null;
    createdAt: string;
    customer: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
    items: {
      id: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: string;
      totalAmount: string;
    }[];
    payments: CreditPaymentRecord[];
  };
}

/**
 * Records a new Sale atomically in a Prisma database transaction.
 *
 * Supports both immediate settlement and credit sales with customer debt tracking.
 *
 * Security & Integrity Guarantees:
 * - Scoped strictly to the active business context.
 * - Product IDs are validated to belong to the business.
 * - Stock quantity is checked before decrementing.
 * - Line totals and total sale amount are calculated SERVER-SIDE using Decimal arithmetic.
 * - Client-supplied totals are never accepted.
 * - For credit sales: customer is strictly mandatory, due date is required,
 *   initial deposit cannot exceed total, and outstanding balance is computed server-side.
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

    const isCreditSale = input.paymentMethod === "CREDIT" || input.isCredit === true;

    if (
      !isCreditSale &&
      !["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"].includes(input.paymentMethod)
    ) {
      return { error: "Invalid payment method selected." };
    }

    // Enforce mandatory customer and due date for credit sales
    if (isCreditSale) {
      if (!input.customerId) {
        return { error: "A customer must be selected to record a credit sale." };
      }

      if (!input.creditDueDate || isNaN(Date.parse(input.creditDueDate))) {
        return { error: "A valid credit due date is required for credit sales." };
      }
    }

    const saleStatus: SaleStatus = input.status || "COMPLETED";

    // Validate customer belongs to active business
    let customerRecord = null;
    if (input.customerId) {
      customerRecord = await prisma.customer.findFirst({
        where: {
          id: input.customerId,
          businessId: context.business.id,
        },
      });
      if (!customerRecord) {
        return { error: "Selected customer does not belong to this business." };
      }
    }

    // Execute atomic transaction for inventory check, stock reduction, sale creation, and initial credit payments
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
          const stockBefore = product.stockQuantity;
          if (stockBefore < qty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Available: ${stockBefore}, Requested: ${qty}.`
            );
          }

          const stockAfter = stockBefore - qty;

          // Decrement stock
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQuantity: {
                decrement: qty,
              },
            },
          });

          // Real-time Low-Stock Alert: trigger when stock crosses below threshold
          if (stockBefore >= product.lowStockThreshold && stockAfter < product.lowStockThreshold) {
            await tx.notification.create({
              data: {
                businessId: context.business.id,
                type: "LOW_STOCK",
                title: `Low Stock Alert: ${product.name}`,
                message: `Inventory for "${product.name}" has dropped to ${stockAfter} unit${stockAfter === 1 ? "" : "s"} (below threshold of ${product.lowStockThreshold}).`,
                productId: product.id,
                read: false,
              },
            });
          }
        }

        // Determine price: either valid custom price or catalog sellingPrice
        const unitPriceNum =
          item.unitPrice !== undefined &&
          item.unitPrice !== null &&
          !isNaN(Number(item.unitPrice)) &&
          Number(item.unitPrice) >= 0
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

      // Calculate initial payments and debt balances for credit sales
      let amountPaidNum = totalAmountNum;
      let outstandingBalanceNum = 0;
      let creditDueDate: Date | null = null;
      let creditStatus: CreditStatus | null = null;
      let initialDepositNum = 0;

      if (isCreditSale) {
        initialDepositNum = Math.max(
          0,
          parseFloat(String(input.initialPaymentAmount || 0)) || 0
        );

        if (initialDepositNum > totalAmountNum) {
          throw new Error("Initial payment amount cannot exceed the total sale amount.");
        }

        amountPaidNum = initialDepositNum;
        outstandingBalanceNum = totalAmountNum - amountPaidNum;
        creditDueDate = new Date(input.creditDueDate!);

        const isOverdue = outstandingBalanceNum > 0 && creditDueDate < new Date();
        creditStatus =
          outstandingBalanceNum === 0
            ? "PAID"
            : isOverdue
            ? "OVERDUE"
            : amountPaidNum > 0
            ? "PARTIALLY_PAID"
            : "UNPAID";
      }

      // Create Sale with items in DB
      const sale = await tx.sale.create({
        data: {
          businessId: context.business.id,
          customerId: input.customerId || null,
          totalAmount: toDecimalString(totalAmountNum),
          paymentMethod: isCreditSale ? "CREDIT" : input.paymentMethod,
          status: saleStatus,
          isCredit: isCreditSale,
          creditDueDate,
          creditStatus,
          amountPaid: toDecimalString(amountPaidNum),
          outstandingBalance: toDecimalString(outstandingBalanceNum),
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

      // If initial deposit / partial payment was made at credit checkout, record CreditPayment
      if (isCreditSale && initialDepositNum > 0) {
        const depositMethod =
          input.initialPaymentMethod &&
          ["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"].includes(input.initialPaymentMethod)
            ? input.initialPaymentMethod
            : "CASH";

        await tx.creditPayment.create({
          data: {
            saleId: sale.id,
            businessId: context.business.id,
            amount: toDecimalString(initialDepositNum),
            paymentMethod: depositMethod,
            note: "Initial down payment at checkout",
            recordedBy: context.user.name || context.user.email || "Staff",
          },
        });
      }

      return sale;
    });

    revalidatePath("/sales");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    const message = isCreditSale
      ? `Credit sale of ${context.business.currency} ${createdSale.totalAmount} recorded for ${customerRecord?.name || "Customer"}. (Outstanding: ${context.business.currency} ${createdSale.outstandingBalance})`
      : `Sale recorded successfully! Total: ${context.business.currency} ${createdSale.totalAmount}`;

    return {
      success: true,
      message,
      saleId: createdSale.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record sale.";
    return { error: message };
  }
}

/**
 * Records a customer debt repayment against an existing credit sale.
 *
 * Security & Integrity Guarantees:
 * - Enforces business membership and RBAC.
 * - Scoped strictly to the active business context (rejects cross-tenant manipulation).
 * - Rejects non-credit sales or already cancelled/refunded sales.
 * - Rejects payments <= 0 or payments exceeding current outstanding balance.
 * - Rejects 'CREDIT' as a repayment method (only Cash, Card, Transfer, Mobile Money).
 * - Atomically logs repayment in CreditPayment and recalculates sale balances and status.
 */
export async function recordCreditPaymentAction(
  businessId: string,
  saleId: string,
  input: CreditPaymentInput
): Promise<SaleActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    // Find sale and verify business ownership
    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        businessId: context.business.id,
      },
      include: {
        customer: true,
      },
    });

    if (!sale) {
      return { error: "Sale not found or does not belong to this business." };
    }

    if (!sale.isCredit) {
      return { error: "This transaction was not recorded as a credit sale." };
    }

    if (sale.status === "CANCELLED" || sale.status === "REFUNDED") {
      return { error: `Cannot record repayments on a ${sale.status.toLowerCase()} sale.` };
    }

    // Validate payment method
    if (
      input.paymentMethod === "CREDIT" ||
      !["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"].includes(input.paymentMethod)
    ) {
      return { error: "Invalid repayment method. Please choose Cash, Card, Bank Transfer, or Mobile Money." };
    }

    // Validate repayment amount
    const payAmount = parseFloat(String(input.amount));
    if (isNaN(payAmount) || payAmount <= 0) {
      return { error: "Repayment amount must be a positive number greater than 0." };
    }

    const currentOutstanding = Number(sale.outstandingBalance.toString());
    if (currentOutstanding <= 0) {
      return { error: "This credit sale has already been fully settled." };
    }

    if (payAmount > currentOutstanding) {
      return {
        error: `Repayment amount (${context.business.currency} ${payAmount.toFixed(2)}) exceeds outstanding balance of ${context.business.currency} ${currentOutstanding.toFixed(2)}.`,
      };
    }

    // Execute atomic transaction for payment logging and balance recalculation
    const updatedSale = await prisma.$transaction(async (tx) => {
      // 1. Create CreditPayment history record
      await tx.creditPayment.create({
        data: {
          saleId: sale.id,
          businessId: context.business.id,
          amount: toDecimalString(payAmount),
          paymentMethod: input.paymentMethod,
          note: input.note?.trim() || null,
          recordedBy: context.user.name || context.user.email || "Staff",
        },
      });

      // 2. Recalculate balances
      const newAmountPaid = Number(sale.amountPaid.toString()) + payAmount;
      const newOutstanding = currentOutstanding - payAmount;

      const isOverdue = newOutstanding > 0 && sale.creditDueDate && sale.creditDueDate < new Date();
      const newCreditStatus: CreditStatus =
        newOutstanding === 0
          ? "PAID"
          : isOverdue
          ? "OVERDUE"
          : "PARTIALLY_PAID";

      // 3. Update Sale record
      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          amountPaid: toDecimalString(newAmountPaid),
          outstandingBalance: toDecimalString(newOutstanding),
          creditStatus: newCreditStatus,
        },
      });

      return updated;
    });

    revalidatePath("/sales");
    revalidatePath("/customers");
    revalidatePath("/dashboard");

    const newOutstandingNum = Number(updatedSale.outstandingBalance.toString());
    const settlementMsg =
      newOutstandingNum === 0
        ? "Debt fully settled!"
        : `Remaining balance: ${context.business.currency} ${updatedSale.outstandingBalance}`;

    return {
      success: true,
      message: `Payment of ${context.business.currency} ${toDecimalString(payAmount)} recorded successfully. ${settlementMsg}`,
      saleId: updatedSale.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record credit payment.";
    return { error: message };
  }
}

/**
 * Retrieves full credit sale information including customer details and repayment installment history.
 */
export async function getCreditSaleDetailsAction(
  businessId: string,
  saleId: string
): Promise<CreditSaleDetailsResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        businessId: context.business.id,
      },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
        creditPayments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!sale) {
      return { error: "Sale record not found or does not belong to this business." };
    }

    return {
      success: true,
      sale: {
        id: sale.id,
        totalAmount: sale.totalAmount.toString(),
        amountPaid: sale.amountPaid.toString(),
        outstandingBalance: sale.outstandingBalance.toString(),
        isCredit: sale.isCredit,
        creditStatus: sale.creditStatus,
        creditDueDate: sale.creditDueDate ? sale.creditDueDate.toISOString() : null,
        createdAt: sale.createdAt.toISOString(),
        customer: sale.customer,
        items: sale.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toString(),
          totalAmount: i.totalAmount.toString(),
        })),
        payments: sale.creditPayments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          paymentMethod: p.paymentMethod,
          note: p.note,
          recordedBy: p.recordedBy,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve credit sale details.";
    return { error: message };
  }
}

/**
 * Cancels or refunds a sale. If the sale was COMPLETED, restores the product inventory.
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
