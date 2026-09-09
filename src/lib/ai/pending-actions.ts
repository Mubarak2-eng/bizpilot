import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export type AIActionType = "CREATE_INVOICE" | "CREATE_SALE" | "CREATE_EXPENSE";

export interface PendingInvoicePayload {
  customerId: string;
  customerName: string;
  items: {
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: number; // Server-resolved DB price
    totalAmount: number;
  }[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  dueDate: string;
  invoiceNumber?: string;
}

export interface PendingSalePayload {
  customerId?: string;
  customerName: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number; // Server-resolved DB price
    totalAmount: number;
  }[];
  totalAmount: number;
  paymentMethod: "CASH" | "CARD" | "TRANSFER" | "MOBILE_MONEY";
}

export interface PendingExpensePayload {
  category: string;
  amount: number;
  description: string | null;
  date: string;
}

export type PendingActionPayload =
  | { type: "CREATE_INVOICE"; data: PendingInvoicePayload }
  | { type: "CREATE_SALE"; data: PendingSalePayload }
  | { type: "CREATE_EXPENSE"; data: PendingExpensePayload };

export interface PendingActionRecord {
  token: string;
  userId: string;
  businessId: string;
  actionType: AIActionType;
  payload: PendingActionPayload;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

// Expiration time: 5 minutes
export const ACTION_TTL_MS = 5 * 60 * 1000;

/**
 * Creates and stores a secure, short-lived pending action token in PostgreSQL (AIPendingAction).
 */
export async function createPendingAction(
  userId: string,
  businessId: string,
  actionType: AIActionType,
  payload: PendingActionPayload,
  ttlMs = ACTION_TTL_MS
): Promise<string> {
  const token = `act_${crypto.randomBytes(24).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  await prisma.aIPendingAction.create({
    data: {
      token,
      userId,
      businessId,
      actionType,
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validates and consumes a pending action token atomically in PostgreSQL.
 * Uses atomic UPDATE conditions (consumedAt: null, expiresAt > now, userId, businessId)
 * to prevent race conditions, replay attacks, expired actions, and cross-tenant tampering.
 */
export async function getAndConsumePendingAction(
  token: string,
  userId: string,
  businessId: string
): Promise<PendingActionRecord> {
  if (!token || token.trim() === "") {
    throw new Error("Action not found or expired. Please ask the assistant again.");
  }

  const now = new Date();

  // 1. Fetch the raw record to inspect state if atomic consume fails
  const existing = await prisma.aIPendingAction.findUnique({
    where: { token },
  });

  if (!existing) {
    throw new Error("Action not found or expired. Please ask the assistant again.");
  }

  // 2. Check tenant & user isolation
  if (existing.businessId !== businessId) {
    throw new Error("Security violation: Action does not belong to the active business.");
  }

  if (existing.userId !== userId) {
    throw new Error("Security violation: Action was initiated by another user.");
  }

  // 3. Check if already consumed
  if (existing.consumedAt !== null) {
    throw new Error("This action has already been confirmed and executed.");
  }

  // 4. Check if expired
  if (existing.expiresAt < now) {
    throw new Error("This action preview has expired (5 minute limit). Please try again.");
  }

  // 5. ATOMIC CONSUMPTION: Update consumedAt only if still null and not expired
  const updateResult = await prisma.aIPendingAction.updateMany({
    where: {
      id: existing.id,
      token,
      userId,
      businessId,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  if (updateResult.count === 0) {
    // A concurrent request consumed it at the exact same millisecond
    throw new Error("This action has already been confirmed and executed.");
  }

  return {
    token: existing.token,
    userId: existing.userId,
    businessId: existing.businessId,
    actionType: existing.actionType as AIActionType,
    payload: existing.payload as unknown as PendingActionPayload,
    createdAt: existing.createdAt.getTime(),
    expiresAt: existing.expiresAt.getTime(),
    used: true,
  };
}

/**
 * Cancels a pending action token in PostgreSQL.
 */
export async function cancelPendingAction(
  token: string,
  userId: string,
  businessId: string
): Promise<boolean> {
  if (!token || token.trim() === "") return false;

  try {
    const result = await prisma.aIPendingAction.deleteMany({
      where: {
        token,
        userId,
        businessId,
        consumedAt: null,
      },
    });

    return result.count > 0;
  } catch (err) {
    console.error("[AI Pending Actions] Error cancelling action:", err);
    return false;
  }
}
