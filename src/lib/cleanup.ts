import { prisma } from "./prisma";

export interface CleanupResult {
  deletedProcessedMessages: number;
  deletedOldSessions: number;
  deletedPendingActions: number;
}

/**
 * Maintenance routine to clean expired serverless state rows from PostgreSQL:
 * 1. WhatsApp processed messages older than 2 hours (past the 1-hour deduplication window)
 * 2. Inactive WhatsApp conversation sessions older than 7 days
 * 3. AI pending actions that have expired for over 1 hour or were consumed over 24 hours ago
 */
export async function cleanupExpiredServerlessState(): Promise<CleanupResult> {
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  try {
    const [msgResult, sessionResult, actionResult] = await Promise.all([
      prisma.whatsAppProcessedMessage.deleteMany({
        where: { createdAt: { lt: twoHoursAgo } },
      }),
      prisma.whatsAppConversationSession.deleteMany({
        where: { lastActivity: { lt: sevenDaysAgo } },
      }),
      prisma.aIPendingAction.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: oneHourAgo } },
            { consumedAt: { lt: oneDayAgo } },
          ],
        },
      }),
    ]);

    return {
      deletedProcessedMessages: msgResult.count,
      deletedOldSessions: sessionResult.count,
      deletedPendingActions: actionResult.count,
    };
  } catch (err) {
    console.error("[Maintenance Cleanup Error]", err);
    return {
      deletedProcessedMessages: 0,
      deletedOldSessions: 0,
      deletedPendingActions: 0,
    };
  }
}
