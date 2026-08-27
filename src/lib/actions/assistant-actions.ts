"use server";

import { requireAuth, getActiveBusiness } from "../auth-helpers";
import {
  getAndConsumePendingAction,
  cancelPendingAction,
} from "../ai/pending-actions";
import { revalidatePath } from "next/cache";

export interface ConfirmActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  actionType?: string;
  recordId?: string;
  displayNumber?: string;
  customerName?: string;
  totalFormatted?: string;
}

import {
  executeConfirmedPendingAction,
  ConfirmedActionOutcome,
} from "../ai/action-executor";

export { executeConfirmedPendingAction };
export type { ConfirmedActionOutcome };

/**
 * Server action to confirm and execute a verified pending AI action from the Web UI.
 * Enforces re-authentication, single-use token consumption, and existing Phase 3 business logic.
 */
export async function confirmAIAction(
  token: string
): Promise<ConfirmActionResult> {
  const startTime = Date.now();
  try {
    const user = await requireAuth();
    if (!user) {
      return { error: "Authentication required to confirm this action." };
    }

    const activeContext = await getActiveBusiness();
    if (!activeContext) {
      return { error: "No active business context found. Please log in again." };
    }

    // 1. Consume pending action token (validates token, expiry, anti-replay, and tenant scope)
    const pendingRecord = getAndConsumePendingAction(
      token,
      user.id,
      activeContext.business.id
    );

    // 2. Dispatch to shared execution logic
    const outcome = await executeConfirmedPendingAction(
      pendingRecord,
      activeContext.business.currency
    );

    const duration = Date.now() - startTime;

    // 3. Audit Logging (Safe: no secrets/keys)
    console.log(
      `[AI Write Audit] type=${pendingRecord.actionType} userId=${user.id} bizId=${activeContext.business.id} status=SUCCESS recordId=${outcome.recordId} duration=${duration}ms`
    );

    // 4. Revalidate all relevant routes
    try {
      revalidatePath("/dashboard");
      revalidatePath("/products");
      revalidatePath("/sales");
      revalidatePath("/invoices");
      revalidatePath("/expenses");
      revalidatePath("/customers");
    } catch {
      // Ignored outside Next.js request context (e.g. unit tests)
    }

    return {
      success: true,
      message: outcome.message,
      actionType: pendingRecord.actionType,
      recordId: outcome.recordId,
      displayNumber: outcome.displayNumber,
      customerName: outcome.customerName,
      totalFormatted: outcome.totalFormatted,
    };
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Failed to execute confirmed action.";

    console.error(
      `[AI Write Audit] status=FAILED error="${errorMessage}" duration=${duration}ms`
    );

    return {
      error: errorMessage,
    };
  }
}

/**
 * Server action to cancel a pending action preview.
 */
export async function cancelAIAction(token: string): Promise<{ success: boolean }> {
  try {
    const user = await requireAuth();
    if (!user) return { success: false };

    const activeContext = await getActiveBusiness();
    if (!activeContext) return { success: false };

    const cancelled = cancelPendingAction(token, user.id, activeContext.business.id);
    return { success: cancelled };
  } catch {
    return { success: false };
  }
}
