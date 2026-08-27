import crypto from "crypto";

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

// In-memory store for pending action tokens with TTL
const pendingActionsMap = new Map<string, PendingActionRecord>();

// Expiration time: 5 minutes
const ACTION_TTL_MS = 5 * 60 * 1000;

/**
 * Creates and stores a secure, short-lived pending action token.
 */
export function createPendingAction(
  userId: string,
  businessId: string,
  actionType: AIActionType,
  payload: PendingActionPayload,
  ttlMs = ACTION_TTL_MS
): string {
  const token = `act_${crypto.randomBytes(24).toString("hex")}`;
  const now = Date.now();

  const record: PendingActionRecord = {
    token,
    userId,
    businessId,
    actionType,
    payload,
    createdAt: now,
    expiresAt: now + ttlMs,
    used: false,
  };

  pendingActionsMap.set(token, record);

  // Periodic cleanup of expired tokens (older than 10 mins)
  if (pendingActionsMap.size > 200) {
    const cutoff = Date.now();
    for (const [k, v] of pendingActionsMap.entries()) {
      if (v.expiresAt < cutoff || v.used) {
        pendingActionsMap.delete(k);
      }
    }
  }

  return token;
}

/**
 * Validates and consumes a pending action token atomically.
 * Prevents replay attacks, expired actions, and cross-tenant tampering.
 */
export function getAndConsumePendingAction(
  token: string,
  userId: string,
  businessId: string
): PendingActionRecord {
  if (!token || !pendingActionsMap.has(token)) {
    throw new Error("Action not found or expired. Please ask the assistant again.");
  }

  const record = pendingActionsMap.get(token)!;

  // 1. Check if already used
  if (record.used) {
    throw new Error("This action has already been confirmed and executed.");
  }

  // 2. Check if expired
  if (Date.now() > record.expiresAt) {
    pendingActionsMap.delete(token);
    throw new Error("This action preview has expired (5 minute limit). Please try again.");
  }

  // 3. Check tenant & user isolation
  if (record.businessId !== businessId) {
    throw new Error("Security violation: Action does not belong to the active business.");
  }

  if (record.userId !== userId) {
    throw new Error("Security violation: Action was initiated by another user.");
  }

  // Atomically mark as used
  record.used = true;
  pendingActionsMap.set(token, record);

  return record;
}

/**
 * Cancels a pending action token.
 */
export function cancelPendingAction(token: string, userId: string, businessId: string): boolean {
  if (!token || !pendingActionsMap.has(token)) return false;
  const record = pendingActionsMap.get(token)!;
  if (record.userId === userId && record.businessId === businessId) {
    pendingActionsMap.delete(token);
    return true;
  }
  return false;
}
