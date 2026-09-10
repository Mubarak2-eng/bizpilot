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
  sendWhatsAppTextMessageForBusiness,
  formatActionPreviewForWhatsApp,
  formatActionSuccessForWhatsApp,
} from "./client";
import { getBusinessSubscription, hasFeature } from "../subscriptions/service";


export interface HandleWhatsAppMessageResult {
  success: boolean;
  replySent?: string;
  actionTaken?: "QUERY" | "ACTION_PREVIEW" | "CONFIRMED" | "CANCELLED" | "UNLINKED" | "RATE_LIMITED" | "ERROR";
  error?: string;
}

/**
 * Handles incoming WhatsApp messages by resolving the sender identity against
 * BizPilot's database and delegating to the unified AI Assistant engine.
 *
 * Multi-tenant routing:
 * 1. Primary: Look up WhatsAppConnection by sender phone number (works for all connection types).
 * 2. Secondary (EMBEDDED_WABA only): If the primary lookup returns no result or returns a
 *    different business than the receiving phone number's business, use receivingPhoneNumberId
 *    to disambiguate — this handles the case where the same customer sends to multiple
 *    BizPilot WABA numbers.
 */
export async function handleIncomingWhatsAppMessage(
  fromRaw: string,
  messageText: string,
  messageId?: string,
  receivingPhoneNumberId?: string
): Promise<HandleWhatsAppMessageResult> {
  const startTime = Date.now();
  const phoneNumber = normalizePhoneNumber(fromRaw);

  if (!phoneNumber) {
    return { success: false, error: "Invalid sender phone number" };
  }

  // 1. Rate Limiting Check
  if (!(await checkRateLimit(phoneNumber))) {
    const rateMsg = "⏳ You are sending messages too fast. Please wait a moment before trying again.";
    await sendWhatsAppTextMessage(phoneNumber, rateMsg);
    return {
      success: false,
      replySent: rateMsg,
      actionTaken: "RATE_LIMITED",
    };
  }

  // 2. Resolve WhatsApp Connection from Database (Zero Client Trust)
  //    Primary: look up by sender phone number.
  //    Secondary: if receivingPhoneNumberId is provided (WABA webhook metadata), use it as
  //    a secondary lookup to ensure we route to the business that owns the receiving WABA number.
  let connection = await prisma.whatsAppConnection.findUnique({
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

  // Secondary routing: if receivingPhoneNumberId is provided and the primary lookup found
  // no connection (or found an INTERNAL_ASSISTANT connection while we have a WABA number),
  // try resolving by the receiving WABA phone number ID.
  if (receivingPhoneNumberId && (!connection || connection.connectionType === "INTERNAL_ASSISTANT")) {
    const wabaConnection = await prisma.whatsAppConnection.findUnique({
      where: { phoneNumberId: receivingPhoneNumberId },
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
    if (wabaConnection) {
      connection = wabaConnection;
    }
  }

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


  // ── Multi-tenant outbound routing helper ────────────────────────────────────
  // All replies within this handler use this function, which automatically routes
  // through the per-business WABA (EMBEDDED_WABA) or the global env vars (INTERNAL_ASSISTANT).
  // businessId is server-verified from the DB connection — never from the client.
  const sendReply = (to: string, text: string) =>
    connection.connectionType === "EMBEDDED_WABA"
      ? sendWhatsAppTextMessageForBusiness(connection.businessId, to, text)
      : sendWhatsAppTextMessage(to, text);

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
    await sendReply(phoneNumber, reply);
    return {
      success: false,
      replySent: reply,
      actionTaken: "ERROR",
      error: errMsg,
    };
  }

  // H3: Verify the business has an active paid subscription with WhatsApp AI entitlement.
  const subState = await getBusinessSubscription(connection.businessId);
  const canUseWhatsApp = await hasFeature(connection.businessId, "whatsapp_ai");
  if (!subState.isActive || !canUseWhatsApp) {
    const statusNotice = !subState.isActive
      ? `is currently *${subState.status}*`
      : `is currently on the *Free* plan`;
    const inactiveMsg =
      `⚠️ *WhatsApp AI Unavailable*\n\n` +
      `Your BizPilot subscription ${statusNotice}.\n\n` +
      `The WhatsApp AI assistant is available on active Starter, Pro, and Business plans.\n\n` +
      `Please renew or upgrade your subscription at:\nhttps://bizpilot.app/settings`;
    await sendReply(phoneNumber, inactiveMsg);
    console.log(
      `[WhatsApp Subscription Gate] msgId=${messageId || "n/a"} from=${phoneNumber} bizId=${connection.businessId} status=${subState.status} plan=${subState.planCode} BLOCKED`
    );
    return {
      success: false,
      replySent: inactiveMsg,
      actionTaken: "ERROR",
      error: `Subscription inactive or unentitled: status=${subState.status}, plan=${subState.planCode}`,
    };
  }

  const session = await getWhatsAppSession(phoneNumber, context.businessId);
  const trimmed = (messageText || "").trim();

  if (!trimmed) {
    const emptyMsg = `👋 Hello! I am your **BizPilot AI Assistant** for **${context.businessName}**.\n\nPlease send your question as text (e.g. *"What were my sales today?"* or *"Show low stock"*).`;
    await sendReply(phoneNumber, emptyMsg);
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
      await sendReply(phoneNumber, reply);
      return { success: true, replySent: reply, actionTaken: "QUERY" };
    }

    try {
      // Consume token (validates token, expiry, anti-replay, and tenant context in PostgreSQL)
      const token = session.activeActionToken;
      const pendingRecord = await getAndConsumePendingAction(
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
      await clearActiveActionToken(phoneNumber);

      // Format response strictly matching requested UX
      const reply = formatActionSuccessForWhatsApp(
        pendingRecord.actionType,
        outcome
      );

      await sendReply(phoneNumber, reply);

      console.log(
        `[WhatsApp Action Audit] type=${pendingRecord.actionType} from=${phoneNumber} bizId=${context.businessId} status=CONFIRMED recordId=${outcome.recordId} duration=${Date.now() - startTime}ms`
      );

      return {
        success: true,
        replySent: reply,
        actionTaken: "CONFIRMED",
      };
    } catch (err: unknown) {
      await clearActiveActionToken(phoneNumber);
      const errMsg = err instanceof Error ? err.message : "Failed to execute confirmed action";
      const reply = `⚠️ *Execution Failed*: ${errMsg}`;
      await sendReply(phoneNumber, reply);

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
      await cancelPendingAction(session.activeActionToken, context.userId, context.businessId);
      await clearActiveActionToken(phoneNumber);
    }

    const reply = "✕ Action was cancelled. No changes were made to your business records.";
    await sendReply(phoneNumber, reply);

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
    await addMessageToSession(phoneNumber, userChatMessage);

    // H2: runAIAssistant atomically enforces checkAndIncrementAIQuota per business.
    const aiResponse = await runAIAssistant(
      priorHistory,
      trimmed,
      context
    );

    // If quota limit was reached, runAIAssistant returns providerUsed === "quota_enforcer"
    if (aiResponse.providerUsed === "quota_enforcer") {
      const quotaMsg =
        `⚠️ *Monthly AI Limit Reached*\n\n` +
        aiResponse.message.content +
        `\n\nUpgrade your subscription at:\nhttps://bizpilot.app/settings`;
      await sendReply(phoneNumber, quotaMsg);
      console.log(
        `[WhatsApp Quota Gate] msgId=${messageId || "n/a"} from=${phoneNumber} bizId=${context.businessId} BLOCKED`
      );
      return {
        success: true,
        replySent: quotaMsg,
        actionTaken: "RATE_LIMITED",
      };
    }

    let replyText = aiResponse.message.content;

    // Check if an action preview was generated
    if (aiResponse.message.actionPreview) {
      const action = aiResponse.message.actionPreview;
      await setActiveActionToken(phoneNumber, action.token);

      replyText = formatActionPreviewForWhatsApp(
        action.actionType,
        action.preview
      );
    } else {
      await clearActiveActionToken(phoneNumber);
    }

    await addMessageToSession(phoneNumber, {
      ...aiResponse.message,
      content: replyText,
    });

    await sendReply(phoneNumber, replyText);

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
    await sendReply(phoneNumber, reply);

    return {
      success: false,
      replySent: reply,
      actionTaken: "ERROR",
      error: errMsg,
    };
  }
}
