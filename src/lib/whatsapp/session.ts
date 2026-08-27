import { ChatMessage } from "../ai/types";
import { WhatsAppSession } from "./types";

const sessionsMap = new Map<string, WhatsAppSession>();
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_HISTORY_LENGTH = 6;

/**
 * Retrieves or initializes an active WhatsApp conversation session.
 */
export function getWhatsAppSession(phoneNumber: string): WhatsAppSession {
  const existing = sessionsMap.get(phoneNumber);
  const now = Date.now();

  if (existing) {
    // If expired, reset history and pending action
    if (now - existing.lastActivity > SESSION_TTL_MS) {
      existing.conversationHistory = [];
      existing.activeActionToken = undefined;
    }
    existing.lastActivity = now;
    return existing;
  }

  const newSession: WhatsAppSession = {
    phoneNumber,
    conversationHistory: [],
    lastActivity: now,
  };

  sessionsMap.set(phoneNumber, newSession);
  return newSession;
}

/**
 * Updates the active pending action token for a phone number.
 */
export function setActiveActionToken(phoneNumber: string, token: string): void {
  const session = getWhatsAppSession(phoneNumber);
  session.activeActionToken = token;
  session.lastActivity = Date.now();
  sessionsMap.set(phoneNumber, session);
}

/**
 * Clears the active pending action token for a phone number.
 */
export function clearActiveActionToken(phoneNumber: string): void {
  const session = sessionsMap.get(phoneNumber);
  if (session) {
    session.activeActionToken = undefined;
    session.lastActivity = Date.now();
  }
}

/**
 * Appends a message to the conversation history (capped at MAX_HISTORY_LENGTH).
 */
export function addMessageToSession(phoneNumber: string, message: ChatMessage): void {
  const session = getWhatsAppSession(phoneNumber);
  session.conversationHistory.push(message);

  if (session.conversationHistory.length > MAX_HISTORY_LENGTH) {
    session.conversationHistory = session.conversationHistory.slice(-MAX_HISTORY_LENGTH);
  }

  session.lastActivity = Date.now();
  sessionsMap.set(phoneNumber, session);
}

/**
 * Removes a WhatsApp session from memory (e.g. on unlinking).
 */
export function deleteWhatsAppSession(phoneNumber: string): void {
  sessionsMap.delete(phoneNumber);
}
