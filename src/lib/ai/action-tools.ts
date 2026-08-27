import { prisma } from "../prisma";
import { verifyBusinessMembership } from "../membership";
import { formatMoney } from "../money";
import {
  AuthenticatedAIContext,
} from "./types";
import {
  createPendingAction,
  PendingExpensePayload,
  PendingInvoicePayload,
  PendingSalePayload,
} from "./pending-actions";
import { PaymentMethod } from "@prisma/client";

export interface DraftInvoiceParams {
  customerName?: string;
  customerId?: string;
  items?: {
    productName?: string;
    productId?: string;
    quantity?: number;
    description?: string;
  }[];
  dueDateDays?: number;
  taxPercent?: number;
}

export interface PrepareExpenseParams {
  category: string;
  amount: number | string;
  description?: string;
  date?: string;
}

export interface PrepareSaleParams {
  customerName?: string;
  customerId?: string;
  items?: {
    productName?: string;
    productId?: string;
    quantity?: number;
  }[];
  paymentMethod?: PaymentMethod | string;
}

/**
 * Resolves a customer against the active business's directory.
 * 1. Checks exact match
 * 2. Checks partial/contains match
 * 3. Handles ambiguous multiple matches by asking user to clarify
 * 4. Refuses gracefully if customer not found
 */
export async function resolveCustomerCandidate(
  businessId: string,
  candidateName?: string,
  customerId?: string
) {
  if (customerId) {
    const cust = await prisma.customer.findFirst({
      where: { id: customerId, businessId },
    });
    if (cust) return cust;
  }

  if (!candidateName || !candidateName.trim()) {
    return null;
  }

  // 1. Clean the candidate name (strip leading/trailing prepositions or punctuation)
  const cleanName = candidateName
    .replace(/^(?:for|to|with|about|customer)\s+/i, "")
    .replace(/\s+(?:for|with|containing|having|consisting of|of|items?)$/i, "")
    .replace(/[:,\s]+$/, "")
    .trim();

  if (!cleanName) return null;

  // 2. Check for exact match (case-insensitive)
  const exactMatches = await prisma.customer.findMany({
    where: {
      businessId,
      name: { equals: cleanName, mode: "insensitive" },
    },
  });

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  // 3. Check for partial / contains match
  const partialMatches = await prisma.customer.findMany({
    where: {
      businessId,
      name: { contains: cleanName, mode: "insensitive" },
    },
    take: 5,
  });

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    const matchNames = partialMatches.map((c) => `"${c.name}"`).join(", ");
    throw new Error(
      `Multiple customers found matching "${cleanName}": ${matchNames}. Please specify the full customer name.`
    );
  }

  // 4. If cleanName had multiple words, try matching first word (e.g. "Chinedu" from "Chinedu Okeke")
  const firstWord = cleanName.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 3 && firstWord !== cleanName) {
    const firstWordMatches = await prisma.customer.findMany({
      where: {
        businessId,
        name: { contains: firstWord, mode: "insensitive" },
      },
      take: 5,
    });

    if (firstWordMatches.length === 1) {
      return firstWordMatches[0];
    }
    if (firstWordMatches.length > 1) {
      const matchNames = firstWordMatches.map((c) => `"${c.name}"`).join(", ");
      throw new Error(
        `Multiple customers found matching "${firstWord}": ${matchNames}. Please specify the full customer name.`
      );
    }
  }

  return null;
}

/**
 * Resolves a product against the active business catalog.
 */
export async function resolveProductCandidate(
  businessId: string,
  candidateName?: string,
  productId?: string
) {
  if (productId) {
    const prod = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (prod) return prod;
  }

  if (!candidateName || !candidateName.trim()) {
    return null;
  }

  const cleanName = candidateName
    .replace(/^(?:for|of|with|containing|units?\s+of|pieces?\s+of|pcs?\s+of|items?\s+of|bottles?\s+of|cartons?\s+of|units?|pieces?|pcs?|items?|bottles?|cartons?)\s+/i, "")
    .replace(/[.,:;]+$/, "")
    .trim();

  // Exact match
  const exact = await prisma.product.findFirst({
    where: {
      businessId,
      name: { equals: cleanName, mode: "insensitive" },
    },
  });
  if (exact) return exact;

  // Contains match
  const partial = await prisma.product.findFirst({
    where: {
      businessId,
      name: { contains: cleanName, mode: "insensitive" },
    },
  });
  if (partial) return partial;

  // Plural/singular fallback (e.g. "power banks" -> "power bank")
  if (cleanName.toLowerCase().endsWith("s")) {
    const singular = cleanName.slice(0, -1);
    const singularMatch = await prisma.product.findFirst({
      where: {
        businessId,
        name: { contains: singular, mode: "insensitive" },
      },
    });
    if (singularMatch) return singularMatch;
  }

  return null;
}

/**
 * 1. draft_invoice: Prepares a validated invoice preview with DB-verified prices and tax.
 */
export async function draft_invoice(
  params: DraftInvoiceParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  if (!params.items || params.items.length === 0) {
    throw new Error("Please specify at least one product or item for the invoice.");
  }

  // 1. Resolve Customer
  const customer = await resolveCustomerCandidate(
    businessId,
    params.customerName,
    params.customerId
  );

  if (!customer) {
    throw new Error(
      `Customer "${params.customerName || "specified"}" was not found in your business directory. Please create the customer first in Customers.`
    );
  }

  // 2. Resolve Products and Real Database Selling Prices
  const resolvedItems: PendingInvoicePayload["items"] = [];
  let subtotal = 0;

  for (const rawItem of params.items) {
    const qty = Math.max(1, parseInt(String(rawItem.quantity || 1), 10));
    const product = await resolveProductCandidate(
      businessId,
      rawItem.productName,
      rawItem.productId
    );

    if (product) {
      const unitPrice = Number(product.sellingPrice.toString());
      const itemTotal = unitPrice * qty;
      subtotal += itemTotal;

      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unitPrice,
        totalAmount: itemTotal,
      });
    } else if (rawItem.description) {
      // Custom custom line item (fallback)
      const unitPrice = 0;
      resolvedItems.push({
        productName: rawItem.description,
        quantity: qty,
        unitPrice,
        totalAmount: 0,
      });
    } else {
      throw new Error(
        `Product "${rawItem.productName || "item"}" was not found in your catalog. Please check the product name.`
      );
    }
  }

  const taxPercent = typeof params.taxPercent === "number" ? params.taxPercent : 7.5;
  const taxAmount = (subtotal * taxPercent) / 100;
  const grandTotal = subtotal + taxAmount;

  const dueDays = typeof params.dueDateDays === "number" ? params.dueDateDays : 14;
  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + dueDays);
  const dueDateStr = dueDateObj.toISOString().split("T")[0];

  const payload: PendingInvoicePayload = {
    customerId: customer.id,
    customerName: customer.name,
    items: resolvedItems,
    subtotal,
    taxPercent,
    taxAmount,
    total: grandTotal,
    dueDate: dueDateStr,
  };

  // Create secure pending action token
  const token = createPendingAction(
    context.userId,
    businessId,
    "CREATE_INVOICE",
    { type: "CREATE_INVOICE", data: payload }
  );

  return {
    isActionPreview: true,
    actionType: "CREATE_INVOICE" as const,
    token,
    currency,
    preview: {
      customer: { id: customer.id, name: customer.name, email: customer.email },
      items: resolvedItems.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: formatMoney(item.unitPrice, currency),
        total: formatMoney(item.totalAmount, currency),
      })),
      subtotal: formatMoney(subtotal, currency),
      tax: `${taxPercent}% (${formatMoney(taxAmount, currency)})`,
      total: formatMoney(grandTotal, currency),
      dueDate: dueDateStr,
    },
  };
}

/**
 * 2. prepare_expense: Prepares a validated expense record preview.
 */
export async function prepare_expense(
  params: PrepareExpenseParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  const category = (params.category || "").trim();
  if (!category || category.length < 2) {
    throw new Error("Please specify a valid expense category (e.g. Rent, Utilities, Supplies, Fuel).");
  }

  const rawAmount = typeof params.amount === "string" ? parseFloat(params.amount.replace(/,/g, "")) : params.amount;
  if (isNaN(rawAmount) || rawAmount <= 0) {
    throw new Error("Expense amount must be a positive number greater than 0.");
  }

  const date = params.date ? params.date : new Date().toISOString().split("T")[0];
  const description = params.description?.trim() || null;

  const payload: PendingExpensePayload = {
    category,
    amount: rawAmount,
    description,
    date,
  };

  const token = createPendingAction(
    context.userId,
    businessId,
    "CREATE_EXPENSE",
    { type: "CREATE_EXPENSE", data: payload }
  );

  return {
    isActionPreview: true,
    actionType: "CREATE_EXPENSE" as const,
    token,
    currency,
    preview: {
      category,
      amount: formatMoney(rawAmount, currency),
      description: description || "No description provided",
      date,
    },
  };
}

/**
 * 3. prepare_sale: Prepares a validated sale (POS) preview with stock checks and DB prices.
 */
export async function prepare_sale(
  params: PrepareSaleParams,
  context: AuthenticatedAIContext
) {
  const membership = await verifyBusinessMembership(context.businessId, context.userId);
  const businessId = membership.business.id;
  const currency = membership.business.currency;

  if (!params.items || params.items.length === 0) {
    throw new Error("Please specify at least one product to sell.");
  }

  // 1. Optional Customer Lookup
  let customer = null;
  if (params.customerId || (params.customerName && params.customerName.trim().toLowerCase() !== "walk-in")) {
    customer = await resolveCustomerCandidate(
      businessId,
      params.customerName,
      params.customerId
    );
  }

  // 2. Resolve Products, Real DB Prices, and Live Stock Availability
  const resolvedItems: PendingSalePayload["items"] = [];
  let totalAmount = 0;

  for (const rawItem of params.items) {
    const qty = Math.max(1, parseInt(String(rawItem.quantity || 1), 10));
    const product = await resolveProductCandidate(
      businessId,
      rawItem.productName,
      rawItem.productId
    );

    if (!product) {
      throw new Error(
        `Product "${rawItem.productName || "item"}" was not found in your inventory.`
      );
    }

    // Check available stock
    if (product.stockQuantity < qty) {
      throw new Error(
        `Insufficient stock for "${product.name}". Available: ${product.stockQuantity}, Requested: ${qty}.`
      );
    }

    const unitPrice = Number(product.sellingPrice.toString());
    const itemTotal = unitPrice * qty;
    totalAmount += itemTotal;

    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unitPrice,
      totalAmount: itemTotal,
    });
  }

  // Validate payment method
  let paymentMethod: PendingSalePayload["paymentMethod"] = "CASH";
  if (params.paymentMethod) {
    const norm = String(params.paymentMethod).toUpperCase();
    if (["CASH", "CARD", "TRANSFER", "MOBILE_MONEY"].includes(norm)) {
      paymentMethod = norm as PendingSalePayload["paymentMethod"];
    }
  }

  const payload: PendingSalePayload = {
    customerId: customer ? customer.id : undefined,
    customerName: customer ? customer.name : "Walk-in Customer",
    items: resolvedItems,
    totalAmount,
    paymentMethod,
  };

  const token = createPendingAction(
    context.userId,
    businessId,
    "CREATE_SALE",
    { type: "CREATE_SALE", data: payload }
  );

  return {
    isActionPreview: true,
    actionType: "CREATE_SALE" as const,
    token,
    currency,
    preview: {
      customer: customer ? customer.name : "Walk-in Customer",
      items: resolvedItems.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unitPrice: formatMoney(item.unitPrice, currency),
        total: formatMoney(item.totalAmount, currency),
      })),
      total: formatMoney(totalAmount, currency),
      paymentMethod,
    },
  };
}
