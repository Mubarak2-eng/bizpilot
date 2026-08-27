import { NextRequest } from "next/server";
import {
  verifyWhatsAppSignature,
  isMessageProcessed,
  markMessageProcessed,
} from "../../../../lib/whatsapp/security";
import { handleIncomingWhatsAppMessage } from "../../../../lib/whatsapp/handler";
import { WhatsAppWebhookPayload } from "../../../../lib/whatsapp/types";

/**
 * GET /api/webhook/whatsapp
 * Handles Meta webhook verification challenge.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const rawToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const expectedToken = (rawToken && rawToken.trim() !== "") ? rawToken.trim() : undefined;

  if (!expectedToken) {
    console.error("[WhatsApp Webhook] Verification rejected: WHATSAPP_VERIFY_TOKEN is not configured.");
    return new Response("Forbidden", { status: 403 });
  }

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[WhatsApp Webhook] Challenge verified successfully.");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn("[WhatsApp Webhook] Verification token mismatch.");
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/webhook/whatsapp
 * Handles incoming WhatsApp notifications, messages, and delivery updates.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    // 1. Signature Verification
    const isValidSignature = verifyWhatsAppSignature(rawBody, signature);
    if (!isValidSignature) {
      console.warn("[WhatsApp Webhook] Invalid signature rejected.");
      return new Response("Unauthorized", { status: 401 });
    }

    if (!rawBody || rawBody.trim() === "") {
      return new Response("OK", { status: 200 });
    }

    const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

    // 2. Process all entries and messages
    if (payload.object === "whatsapp_business_account" && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          const value = change.value;
          if (!value || !Array.isArray(value.messages)) continue;

          for (const msg of value.messages) {
            const messageId = msg.id;

            // Idempotency: Prevent duplicate message processing
            if (isMessageProcessed(messageId)) {
              console.log(`[WhatsApp Webhook] Deduplicated messageId=${messageId}`);
              continue;
            }
            markMessageProcessed(messageId);

            // Extract message text from text, interactive button reply, or quick reply
            let messageText = "";
            if (msg.type === "text" && msg.text?.body) {
              messageText = msg.text.body;
            } else if (msg.type === "interactive" && msg.interactive?.button_reply?.title) {
              messageText = msg.interactive.button_reply.title;
            } else if (msg.type === "interactive" && msg.interactive?.list_reply?.title) {
              messageText = msg.interactive.list_reply.title;
            } else if (msg.button?.text) {
              messageText = msg.button.text;
            }

            if (msg.from) {
              // Dispatch to core WhatsApp message handler
              await handleIncomingWhatsAppMessage(msg.from, messageText, messageId);
            }
          }
        }
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal webhook processing error";
    console.error("[WhatsApp Webhook Error]", errorMsg);
    // Always return 200 to Meta to avoid infinite retry loops on internal errors
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
}
