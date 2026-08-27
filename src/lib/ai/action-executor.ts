import { prisma } from "../prisma";
import { formatMoney, toDecimalString } from "../money";
import { PendingActionRecord } from "./pending-actions";
import { revalidatePath } from "next/cache";

export interface ConfirmedActionOutcome {
  success: boolean;
  actionType: string;
  recordId?: string;
  displayNumber?: string;
  customerName?: string;
  totalFormatted?: string;
  category?: string;
  description?: string;
  paymentMethod?: string;
  message: string;
}

/**
 * Executes a confirmed pending action directly in PostgreSQL with full transactional integrity.
 * Used by both Web Server Actions and the WhatsApp webhook pipeline.
 */
export async function executeConfirmedPendingAction(
  pendingRecord: PendingActionRecord,
  currency: string
): Promise<ConfirmedActionOutcome> {
  const businessId = pendingRecord.businessId;

  if (pendingRecord.payload.type === "CREATE_INVOICE") {
    const invData = pendingRecord.payload.data;

    // Generate unique invoice number: INV-YYYY-XXXX
    const year = new Date().getFullYear();
    const count = await prisma.invoice.count({
      where: {
        businessId,
        invoiceNumber: { startsWith: `INV-${year}-` },
      },
    });

    let invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
    const existing = await prisma.invoice.findUnique({
      where: {
        businessId_invoiceNumber: {
          businessId,
          invoiceNumber,
        },
      },
    });

    if (existing) {
      invoiceNumber = `INV-${year}-${String(count + 2).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;
    }

    const invoice = await prisma.invoice.create({
      data: {
        businessId,
        customerId: invData.customerId,
        invoiceNumber,
        status: "SENT",
        subtotal: toDecimalString(invData.subtotal),
        tax: toDecimalString(invData.taxAmount),
        total: toDecimalString(invData.total),
        dueDate: new Date(invData.dueDate),
        items: {
          create: invData.items.map((item) => ({
            productId: item.productId || null,
            description: item.productName,
            quantity: item.quantity,
            unitPrice: toDecimalString(item.unitPrice),
            totalAmount: toDecimalString(item.totalAmount),
          })),
        },
      },
    });

    const totalFormatted = formatMoney(invData.total, currency);

    try {
      revalidatePath("/invoices");
      revalidatePath("/dashboard");
      revalidatePath("/customers");
    } catch {
      // Ignored outside Next.js request context
    }

    return {
      success: true,
      actionType: "CREATE_INVOICE",
      recordId: invoice.id,
      displayNumber: invoiceNumber,
      customerName: invData.customerName,
      totalFormatted,
      message: `Invoice created successfully!\n\nInvoice: ${invoiceNumber}\nCustomer: ${invData.customerName}\nTotal: ${totalFormatted}`,
    };
  } else if (pendingRecord.payload.type === "CREATE_EXPENSE") {
    const expData = pendingRecord.payload.data;

    const expense = await prisma.expense.create({
      data: {
        businessId,
        category: expData.category,
        amount: toDecimalString(expData.amount),
        description: expData.description,
        createdAt: new Date(expData.date),
      },
    });

    const amountFormatted = formatMoney(expData.amount, currency);

    try {
      revalidatePath("/expenses");
      revalidatePath("/dashboard");
    } catch {
      // Ignored outside Next.js request context
    }

    return {
      success: true,
      actionType: "CREATE_EXPENSE",
      recordId: expense.id,
      category: expData.category,
      description: expData.description || undefined,
      totalFormatted: amountFormatted,
      message: `Expense recorded successfully!\n\nCategory: ${expData.category}\nAmount: ${amountFormatted}${expData.description ? `\nDescription: ${expData.description}` : ""}`,
    };
  } else if (pendingRecord.payload.type === "CREATE_SALE") {
    const saleData = pendingRecord.payload.data;

    // Transactional stock check & inventory decrement
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Re-verify live stock for all items
      for (const item of saleData.items) {
        const liveProd = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!liveProd || liveProd.businessId !== businessId) {
          throw new Error(`Product "${item.productName}" not found in business catalog`);
        }

        if (liveProd.stockQuantity < item.quantity) {
          throw new Error(
            `Insufficient stock for "${liveProd.name}". Available: ${liveProd.stockQuantity}, Requested: ${item.quantity}`
          );
        }
      }

      // 2. Decrement inventory
      for (const item of saleData.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }

      // 3. Create Sale and SaleItems
      return tx.sale.create({
        data: {
          businessId,
          customerId: saleData.customerId || null,
          totalAmount: toDecimalString(saleData.totalAmount),
          paymentMethod: saleData.paymentMethod,
          status: "COMPLETED",
          items: {
            create: saleData.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: toDecimalString(item.unitPrice),
              totalAmount: toDecimalString(item.totalAmount),
            })),
          },
        },
      });
    });

    const totalFormatted = formatMoney(saleData.totalAmount, currency);
    const saleDisplay = `SAL-${sale.id.slice(-6).toUpperCase()}`;

    try {
      revalidatePath("/sales");
      revalidatePath("/products");
      revalidatePath("/dashboard");
    } catch {
      // Ignored outside Next.js request context
    }

    return {
      success: true,
      actionType: "CREATE_SALE",
      recordId: sale.id,
      displayNumber: saleDisplay,
      customerName: saleData.customerName,
      paymentMethod: saleData.paymentMethod,
      totalFormatted,
      message: `Sale recorded successfully!\n\nSale: ${saleDisplay}\nCustomer: ${saleData.customerName}\nTotal: ${totalFormatted}\nPayment Method: ${saleData.paymentMethod}`,
    };
  } else {
    throw new Error("Unsupported AI action type.");
  }
}
