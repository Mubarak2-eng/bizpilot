import { prisma } from "../prisma";
import { ChatMessage } from "../ai/types";
import { WhatsAppSession } from "./types";

export const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_HISTORY_LENGTH = 6;

/**
 * Retrieves or initializes an active WhatsApp conversation session from PostgreSQL.
 * If the session is older than 15 minutes, its conversation history and pending action token are reset.
 */
export async function getWhatsAppSession(
  phoneNumber: string,
  businessId?: string
): Promise<WhatsAppSession> {
  const now = new Date();
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);

  try {
    const existing = await prisma.whatsAppConversationSession.findUnique({
      where: { phoneNumber },
    });

    if (existing) {
      let history = Array.isArray(existing.history)
        ? (existing.history as unknown as ChatMessage[])
        : [];
      let activeToken = existing.activeActionToken || undefined;

      // Inactivity check: If inactive for > 15 minutes, reset history and pending action
      if (existing.lastActivity < cutoff) {
        history = [];
        activeToken = undefined;

        await prisma.whatsAppConversationSession.update({
          where: { phoneNumber },
          data: {
            history: [],
            activeActionToken: null,
            lastActivity: now,
            ...(businessId ? { businessId } : {}),
          },
        });
      } else {
        // Update lastActivity timestamp
        await prisma.whatsAppConversationSession.update({
          where: { phoneNumber },
          data: {
            lastActivity: now,
            ...(businessId && !existing.businessId ? { businessId } : {}),
          },
        });
      }

      return {
        phoneNumber,
        conversationHistory: history,
        activeActionToken: activeToken,
        lastActivity: existing.lastActivity.getTime(),
      };
    }

    // Create new session in PostgreSQL
    const created = await prisma.whatsAppConversationSession.create({
      data: {
        phoneNumber,
        businessId: businessId || null,
        history: [],
        lastActivity: now,
      },
    });

    return {
      phoneNumber,
      conversationHistory: [],
      lastActivity: created.lastActivity.getTime(),
    };
  } catch (err) {
    console.error("[WhatsApp Session] Error getting/creating session:", err);
    return {
      phoneNumber,
      conversationHistory: [],
      lastActivity: Date.now(),
    };
  }
}

/**
 * Updates the active pending action token for a phone number in PostgreSQL.
 */
export async function setActiveActionToken(
  phoneNumber: string,
  token: string
): Promise<void> {
  const now = new Date();
  try {
    await prisma.whatsAppConversationSession.upsert({
      where: { phoneNumber },
      create: {
        phoneNumber,
        activeActionToken: token,
        history: [],
        lastActivity: now,
      },
      update: {
        activeActionToken: token,
        lastActivity: now,
      },
    });
  } catch (err) {
    console.error("[WhatsApp Session] Error setting active action token:", err);
  }
}

/**
 * Clears the active pending action token for a phone number in PostgreSQL.
 */
export async function clearActiveActionToken(phoneNumber: string): Promise<void> {
  const now = new Date();
  try {
    await prisma.whatsAppConversationSession.update({
      where: { phoneNumber },
      data: {
        activeActionToken: null,
        lastActivity: now,
      },
    });
  } catch {
    // If record doesn't exist, ignore
  }
}

/**
 * Appends a message to the conversation history in PostgreSQL (capped at MAX_HISTORY_LENGTH = 6).
 */
export async function addMessageToSession(
  phoneNumber: string,
  message: ChatMessage
): Promise<void> {
  try {
    const session = await getWhatsAppSession(phoneNumber);
    const updatedHistory = [...session.conversationHistory, message];

    const cappedHistory =
      updatedHistory.length > MAX_HISTORY_LENGTH
        ? updatedHistory.slice(-MAX_HISTORY_LENGTH)
        : updatedHistory;

    await prisma.whatsAppConversationSession.update({
      where: { phoneNumber },
      data: {
        history: cappedHistory as any,
        lastActivity: new Date(),
      },
    });
  } catch (err) {
    console.error("[WhatsApp Session] Error adding message to session:", err);
  }
}

/**
 * Removes a WhatsApp session from PostgreSQL (e.g. on unlinking).
 */
export async function deleteWhatsAppSession(phoneNumber: string): Promise<void> {
  try {
    await prisma.whatsAppConversationSession.deleteMany({
      where: { phoneNumber },
    });
  } catch (err) {
    console.error("[WhatsApp Session] Error deleting session:", err);
  }
}
