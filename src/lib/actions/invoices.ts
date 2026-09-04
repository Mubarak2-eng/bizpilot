"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { InvoiceStatus } from "@prisma/client";
import { Role } from "@/types/auth";
import { toDecimalString } from "@/lib/money";

export interface InvoiceItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number | string;
}

export interface CreateInvoiceInput {
  customerId: string;
  invoiceNumber?: string;
  dueDate: string; // ISO date string
  taxPercent?: number;
  status?: InvoiceStatus;
  items: InvoiceItemInput[];
}

export interface InvoiceActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  invoiceId?: string;
}

/**
 * Creates a new invoice with line items, calculated subtotal, tax, and total.
 * Enforces unique invoiceNumber per business.
 */
export async function createInvoiceAction(
  businessId: string,
  input: CreateInvoiceInput
): Promise<InvoiceActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    if (!input.customerId) {
      return { error: "A customer must be selected to create an invoice." };
    }

    // Verify customer belongs to active business
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        businessId: context.business.id,
      },
    });

    if (!customer) {
      return { error: "Selected customer not found in this business." };
    }

    if (!input.items || input.items.length === 0) {
      return { error: "At least one line item is required on the invoice." };
    }

    if (!input.dueDate) {
      return { error: "A valid due date is required." };
    }

    // Generate or validate invoice number
    let invoiceNumber = input.invoiceNumber?.trim();
    if (!invoiceNumber) {
      const count = await prisma.invoice.count({
        where: { businessId: context.business.id },
      });
      const year = new Date().getFullYear();
      invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
    }

    // Check uniqueness per business
    const existing = await prisma.invoice.findUnique({
      where: {
        businessId_invoiceNumber: {
          businessId: context.business.id,
          invoiceNumber,
        },
      },
    });

    if (existing) {
      return { error: `Invoice number "${invoiceNumber}" is already in use for this business.` };
    }

    // Calculate subtotal, tax, and total server-side
    let subtotalNum = 0;
    const verifiedItems: {
      productId: string | null;
      description: string;
      quantity: number;
      unitPrice: string;
      totalAmount: string;
    }[] = [];

    for (const item of input.items) {
      const desc = item.description?.trim();
      if (!desc) {
        return { error: "Description is required for each invoice item." };
      }

      const qty = parseInt(String(item.quantity), 10);
      if (isNaN(qty) || qty <= 0) {
        return { error: `Invalid quantity for item "${desc}". Must be at least 1.` };
      }

      const price = parseFloat(String(item.unitPrice));
      if (isNaN(price) || price < 0) {
        return { error: `Invalid unit price for item "${desc}".` };
      }

      const lineTotal = qty * price;
      subtotalNum += lineTotal;

      verifiedItems.push({
        productId: item.productId || null,
        description: desc,
        quantity: qty,
        unitPrice: toDecimalString(price),
        totalAmount: toDecimalString(lineTotal),
      });
    }

    const taxPercent = Math.max(0, input.taxPercent || 0);
    const taxNum = (subtotalNum * taxPercent) / 100;
    const totalNum = subtotalNum + taxNum;

    const invoice = await prisma.invoice.create({
      data: {
        businessId: context.business.id,
        customerId: customer.id,
        invoiceNumber,
        status: input.status || "SENT",
        subtotal: toDecimalString(subtotalNum),
        tax: toDecimalString(taxNum),
        total: toDecimalString(totalNum),
        dueDate: new Date(input.dueDate),
        items: {
          create: verifiedItems,
        },
      },
    });

    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      success: true,
      message: `Invoice ${invoiceNumber} created successfully! Total: ${context.business.currency} ${toDecimalString(totalNum)}`,
      invoiceId: invoice.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create invoice.";
    return { error: message };
  }
}

/**
 * Updates the status of an invoice (e.g., PAID, CANCELLED, SENT).
 */
export async function updateInvoiceStatusAction(
  businessId: string,
  invoiceId: string,
  newStatus: InvoiceStatus
): Promise<InvoiceActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const existing = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Invoice not found or does not belong to this business." };
    }

    await prisma.invoice.update({
      where: { id: existing.id },
      data: { status: newStatus },
    });

    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      success: true,
      message: `Invoice ${existing.invoiceNumber} status updated to ${newStatus}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update invoice status.";
    return { error: message };
  }
}

/**
 * Deletes an invoice.
 * Requires ADMIN or OWNER role.
 */
export async function deleteInvoiceAction(
  businessId: string,
  invoiceId: string
): Promise<InvoiceActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const existing = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        businessId: context.business.id,
      },
    });

    if (!existing) {
      return { error: "Invoice not found or does not belong to this business." };
    }

    await prisma.invoice.delete({
      where: { id: existing.id },
    });

    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      success: true,
      message: `Invoice ${existing.invoiceNumber} deleted successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete invoice.";
    return { error: message };
  }
}
