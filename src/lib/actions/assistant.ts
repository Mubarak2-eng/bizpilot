"use server";

import { requireAuth, requireBusinessMembership } from "../auth-helpers";
import { ChatMessage } from "../ai/types";
import { runAIAssistant } from "../ai/executor";

export interface AssistantActionResult {
  success?: boolean;
  message?: ChatMessage;
  error?: string;
  provider?: string;
}

/**
 * Server action to process an AI Assistant query from the chat UI.
 * Enforces strict authentication and multi-tenant scoping.
 */
export async function askAssistantAction(
  businessId: string,
  conversationHistory: ChatMessage[],
  userQuery: string
): Promise<AssistantActionResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return { error: "Authentication required to use AI Assistant." };
    }

    if (!userQuery || userQuery.trim().length === 0) {
      return { error: "Please enter a question or request." };
    }

    if (userQuery.length > 1000) {
      return { error: "Query is too long. Please keep your question under 1,000 characters." };
    }

    // Verify user belongs to the active business
    const context = await requireBusinessMembership(businessId);

    // Limit conversation history sent to AI to prevent payload exhaustion
    const safeHistory = (conversationHistory || []).slice(-12);

    const aiContext = {
      userId: user.id,
      businessId: context.business.id,
      businessName: context.business.name,
      currency: context.business.currency,
      role: context.role,
    };

    const result = await runAIAssistant(safeHistory, userQuery, aiContext);

    return {
      success: true,
      message: result.message,
      provider: result.providerUsed,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred while communicating with the AI Assistant.";
    console.error("[AI Assistant Error]", message);
    return {
      error: message.includes("Unauthorized") || message.includes("Forbidden")
        ? message
        : "The AI Assistant encountered an issue processing your request. Please try again.",
    };
  }
}
