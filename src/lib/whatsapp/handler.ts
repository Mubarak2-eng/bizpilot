import { prisma } from "../prisma";
import { verifyBusinessMembership } from "../membership";
import { AuthenticatedAIContext, ChatMessage } from "../ai/types";
import { runAIAssistant } from "../ai/executor";
import {
  getAndConsumePendingAction,
  cancelPendingAction,
} from "../ai/pending-actions";
import { executeConfirmedPendingAction } from "../ai/action-executor";
import { normalizePhoneNumber, checkRateLimit } from "./security";
import {
  getWhatsAppSession,
  setActiveActionToken,
  clearActiveActionToken,
  addMessageToSession,
} from "./session";
import {
  sendWhatsAppTextMessage,
  formatActionPreviewForWhatsApp,
  formatActionSuccessForWhatsApp,
} from "./client";

export interface HandleWhatsAppMessageResult {
  success: boolean;
  replySent?: string;
  actionTaken?: "QUERY" | "ACTION_PREVIEW" | "CONFIRMED" | "CANCELLED" | "UNLINKED" | "RATE_LIMITED" | "ERROR";
  error?: string;
}

/**
 * Handles incoming WhatsApp messages by resolving the sender identity against
 * BizPilot's database and delegating to the unified AI Assistant engine.
 */
export async function handleIncomingWhatsAppMessage(
  fromRaw: string,
  messageText: string,
  messageId?: string
): Promise<HandleWhatsAppMessageResult> {
  const startTime = Date.now();
  const phoneNumber = normalizePhoneNumber(fromRaw);

  if (!phoneNumber) {
    return { success: false, error: "Invalid sender phone number" };
  }

  // 1. Rate Limiting Check
  if (!checkRateLimit(phoneNumber)) {
    const rateMsg = "⏳ You are sending messages too fast. Please wait a moment before trying again.";
    await sendWhatsAppTextMessage(phoneNumber, rateMsg);
    return {
      success: false,
      replySent: rateMsg,
      actionTaken: "RATE_LIMITED",
    };
  }

  // 2. Resolve WhatsApp Connection from Database (Zero Client Trust)
  const connection = await prisma.whatsAppConnection.findUnique({
    where: { phoneNumber },
    include: {
      business: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // If number is not linked or not verified
  if (!connection || !connection.verified) {
    const unlinkedMsg =
      "👋 Welcome to *BizPilot AI*!\n\nYour WhatsApp number is not yet linked to an active BizPilot business account.\n\nPlease log in to your BizPilot dashboard and link your WhatsApp number in Settings.";
    await sendWhatsAppTextMessage(phoneNumber, unlinkedMsg);

    console.log(
      `[WhatsApp Audit] msgId=${messageId || "n/a"} from=${phoneNumber} status=UNLINKED duration=${Date.now() - startTime}ms`
    );

    return {
      success: true,
      replySent: unlinkedMsg,
      actionTaken: "UNLINKED",
    };
  }

  // 3. Verify Active Membership & Authorization Context
  let context: AuthenticatedAIContext;
  try {
    const membership = await verifyBusinessMembership(
      connection.businessId,
      connection.userId
    );

    context = {
      userId: connection.userId,
      businessId: connection.businessId,
      businessName: connection.business.name,
      currency: connection.business.currency,
      role: membership.role,
    };
  } catch (authErr: unknown) {
    const errMsg = authErr instanceof Error ? authErr.message : "Access denied";
    const reply = `⚠️ *Access Denied*: ${errMsg}. Please check your business membership.`;
    await sendWhatsAppTextMessage(phoneNumber, reply);
    return {
      success: false,
      replySent: reply,
      actionTaken: "ERROR",
      error: errMsg,
    };
  }

  const session = getWhatsAppSession(phoneNumber);
  const trimmed = (messageText || "").trim();

  if (!trimmed) {
    const emptyMsg = `👋 Hello! I am your **BizPilot AI Assistant** for **${context.businessName}**.\n\nPlease send your question as text (e.g. *"What were my sales today?"* or *"Show low stock"*).`;
    await sendWhatsAppTextMessage(phoneNumber, emptyMsg);
    return {
      success: true,
      replySent: emptyMsg,
      actionTaken: "QUERY",
    };
  }

  const normalizedCommand = trimmed.toUpperCase();

  // 4. Handle CONFIRMATION ("1", "CONFIRM", "YES", "CONFIRM INVOICE", "CONFIRM SALE", "CONFIRM EXPENSE")
  if (
    normalizedCommand === "1" ||
    normalizedCommand === "1." ||
    normalizedCommand === "CONFIRM" ||
    normalizedCommand === "YES" ||
    normalizedCommand.startsWith("CONFIRM ")
  ) {
    if (!session.activeActionToken) {
      const reply =
        "There is no pending action to confirm. You can ask me a question or request a new action (e.g. 'Create an invoice for Chinedu for 2 power banks').";
      await sendWhatsAppTextMessage(phoneNumber, reply);
      return { success: true, replySent: reply, actionTaken: "QUERY" };
    }

    try {
      // Consume token (validates token, expiry, anti-replay, and tenant context)
      const token = session.activeActionToken;
      const pendingRecord = getAndConsumePendingAction(
        token,
        context.userId,
        context.businessId
      );

      // Execute confirmed database write
      const outcome = await executeConfirmedPendingAction(
        pendingRecord,
        context.currency
      );

      // Clear session token
      clearActiveActionToken(phoneNumber);

      // Format response strictly matching requested UX
      const reply = formatActionSuccessForWhatsApp(
        pendingRecord.actionType,
        outcome
      );

      await sendWhatsAppTextMessage(phoneNumber, reply);

      console.log(
        `[WhatsApp Action Audit] type=${pendingRecord.actionType} from=${phoneNumber} bizId=${context.businessId} status=CONFIRMED recordId=${outcome.recordId} duration=${Date.now() - startTime}ms`
      );

      return {
        success: true,
        replySent: reply,
        actionTaken: "CONFIRMED",
      };
    } catch (err: unknown) {
      clearActiveActionToken(phoneNumber);
      const errMsg = err instanceof Error ? err.message : "Failed to execute confirmed action";
      const reply = `⚠️ *Execution Failed*: ${errMsg}`;
      await sendWhatsAppTextMessage(phoneNumber, reply);

      return {
        success: false,
        replySent: reply,
        actionTaken: "ERROR",
        error: errMsg,
      };
    }
  }

  // 5. Handle CANCELLATION ("2", "2.", "CANCEL", "NO")
  if (
    normalizedCommand === "2" ||
    normalizedCommand === "2." ||
    normalizedCommand === "CANCEL" ||
    normalizedCommand === "NO" ||
    normalizedCommand.startsWith("CANCEL ")
  ) {
    if (session.activeActionToken) {
      cancelPendingAction(session.activeActionToken, context.userId, context.businessId);
      clearActiveActionToken(phoneNumber);
    }

    const reply = "✕ Action was cancelled. No changes were made to your business records.";
    await sendWhatsAppTextMessage(phoneNumber, reply);

    return {
      success: true,
      replySent: reply,
      actionTaken: "CANCELLED",
    };
  }

  // 6. Natural Language Query or Action Request through Phase 4A/4B AI Engine
  try {
    const userChatMessage: ChatMessage = {
      id: `wa-usr-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const priorHistory = [...session.conversationHistory];
    addMessageToSession(phoneNumber, userChatMessage);

    const aiResponse = await runAIAssistant(
      priorHistory,
      trimmed,
      context
    );

    let replyText = aiResponse.message.content;

    // Check if an action preview was generated
    if (aiResponse.message.actionPreview) {
      const action = aiResponse.message.actionPreview;
      setActiveActionToken(phoneNumber, action.token);

      replyText = formatActionPreviewForWhatsApp(
        action.actionType,
        action.preview
      );
    } else {
      clearActiveActionToken(phoneNumber);
    }

    addMessageToSession(phoneNumber, {
      ...aiResponse.message,
      content: replyText,
    });

    await sendWhatsAppTextMessage(phoneNumber, replyText);

    console.log(
      `[WhatsApp AI Audit] msgId=${messageId || "n/a"} from=${phoneNumber} bizId=${context.businessId} action=${aiResponse.message.actionPreview ? "ACTION_PREVIEW" : "QUERY"} duration=${Date.now() - startTime}ms`
    );

    return {
      success: true,
      replySent: replyText,
      actionTaken: aiResponse.message.actionPreview ? "ACTION_PREVIEW" : "QUERY",
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Error processing assistant request";
    const reply = `⚠️ *Assistant Error*: ${errMsg}`;
    await sendWhatsAppTextMessage(phoneNumber, reply);

    return {
      success: false,
      replySent: reply,
      actionTaken: "ERROR",
      error: errMsg,
    };
  }
}
