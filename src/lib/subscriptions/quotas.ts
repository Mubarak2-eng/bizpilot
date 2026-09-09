import { prisma } from "../prisma";
import { getBusinessSubscription } from "./service";
import { PlanCode } from "@prisma/client";

export interface AIUsageStatus {
  queryCount: number;
  limit: number;
  remaining: number;
  periodKey: string;
  planCode: PlanCode;
  isExhausted: boolean;
}

export interface AIQuotaCheckResult {
  allowed: boolean;
  queryCount: number;
  limit: number;
  remaining: number;
  planCode: PlanCode;
  message?: string;
}

/**
 * Returns the standard monthly period key (e.g. "2026-08").
 */
export function getCurrentPeriodKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Retrieves the current AI usage metrics for the active billing cycle.
 */
export async function getAIUsage(
  businessId: string,
  referenceDate = new Date()
): Promise<AIUsageStatus> {
  const subState = await getBusinessSubscription(businessId, referenceDate);
  const periodKey = getCurrentPeriodKey(referenceDate);

  const usageRecord = await prisma.aIUsage.findUnique({
    where: {
      businessId_periodKey: {
        businessId,
        periodKey,
      },
    },
  });

  const queryCount = usageRecord?.queryCount ?? 0;
  const limit = subState.plan.aiMonthlyLimit;
  const remaining = Math.max(0, limit - queryCount);
  const isExhausted = queryCount >= limit;

  return {
    queryCount,
    limit,
    remaining,
    periodKey,
    planCode: subState.planCode,
    isExhausted,
  };
}

/**
 * Atomically checks and increments the monthly AI quota for a business.
 * Prevents race conditions and stops queries immediately when limit is reached.
 */
export async function checkAndIncrementAIQuota(
  businessId: string,
  referenceDate = new Date()
): Promise<AIQuotaCheckResult> {
  const periodKey = getCurrentPeriodKey(referenceDate);

  // 1. Resolve business plan limit before transaction
  const subState = await getBusinessSubscription(businessId, referenceDate);
  const limit = subState.plan.aiMonthlyLimit;

  return prisma.$transaction(
    async (tx) => {
      // 2. Fetch current usage record
      const usage = await tx.aIUsage.findUnique({
        where: {
          businessId_periodKey: {
            businessId,
            periodKey,
          },
        },
      });

      const currentCount = usage?.queryCount ?? 0;

      // 3. Enforce quota ceiling
      if (currentCount >= limit) {
        return {
          allowed: false,
          queryCount: currentCount,
          limit,
          remaining: 0,
          planCode: subState.planCode,
          message: `You've reached your ${limit} AI queries for this month.\n\nYour Business Brain and core business data are still available.\n\nUpgrade your plan to continue using BizPilot AI.`,
        };
      }

      // 4. Atomically increment usage
      const updated = await tx.aIUsage.upsert({
        where: {
          businessId_periodKey: {
            businessId,
            periodKey,
          },
        },
        create: {
          businessId,
          periodKey,
          queryCount: 1,
        },
        update: {
          queryCount: { increment: 1 },
        },
      });

      const remaining = Math.max(0, limit - updated.queryCount);

      return {
        allowed: true,
        queryCount: updated.queryCount,
        limit,
        remaining,
        planCode: subState.planCode,
      };
    },
    { maxWait: 15000, timeout: 20000 }
  );
}
