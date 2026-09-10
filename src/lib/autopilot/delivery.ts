import { prisma } from "../prisma";
import { sendWhatsAppTextMessage, SendWhatsAppResult } from "../whatsapp/client";
import { evaluateBusinessAutopilot } from "./engine";

export interface OutboundDeliveryResult {
  success: boolean;
  phoneNumber?: string;
  messageId?: string;
  reason?: string;
  simulated?: boolean;
}

/**
 * Sends the Morning Business Brief to the verified WhatsApp connection for a business.
 * Strictly checks that the connection is verified before transmitting any business data.
 */
export async function sendMorningBriefToWhatsApp(
  businessId: string
): Promise<OutboundDeliveryResult> {
  const connection = await prisma.whatsAppConnection.findUnique({
    where: { businessId },
  });

  if (!connection || !connection.verified) {
    return {
      success: false,
      reason: "NO_VERIFIED_WHATSAPP_CONNECTION",
    };
  }

  const autopilot = await evaluateBusinessAutopilot(businessId);
  const briefText = autopilot.morningBrief.formattedMessage;

  const result: SendWhatsAppResult = await sendWhatsAppTextMessage(
    connection.phoneNumber,
    briefText
  );

  return {
    success: result.success,
    phoneNumber: connection.phoneNumber,
    messageId: result.messageId,
    simulated: result.simulated,
    reason: result.error,
  };
}

/**
 * Sends a high-priority Autopilot critical alert to the verified WhatsApp connection.
 */
export async function sendCriticalAlertToWhatsApp(
  businessId: string,
  alertTitle: string,
  alertExplanation: string,
  recommendedAction: string
): Promise<OutboundDeliveryResult> {
  const connection = await prisma.whatsAppConnection.findUnique({
    where: { businessId },
  });

  if (!connection || !connection.verified) {
    return {
      success: false,
      reason: "NO_VERIFIED_WHATSAPP_CONNECTION",
    };
  }

  const messageText = `🚨 *BIZPILOT CRITICAL ALERT*\n\n⚠️ *${alertTitle}*\n${alertExplanation}\n\n👉 *Recommended Action*: ${recommendedAction}`;

  const result = await sendWhatsAppTextMessage(connection.phoneNumber, messageText);

  return {
    success: result.success,
    phoneNumber: connection.phoneNumber,
    messageId: result.messageId,
    simulated: result.simulated,
    reason: result.error,
  };
}
