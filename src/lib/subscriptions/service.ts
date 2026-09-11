import { prisma } from "../prisma";
import { PlanCode, SubscriptionStatus, Prisma } from "@prisma/client";
import {
  PLAN_DEFINITIONS,
  PlanDefinition,
  FeatureKey,
  FEATURE_PLAN_MAP,
  ensureDefaultPlans,
} from "./plans";

export { ensureDefaultPlans };

export interface EffectiveSubscriptionState {
  subscriptionId: string;
  businessId: string;
  planCode: PlanCode;
  plan: PlanDefinition;
  status: SubscriptionStatus;
  isTrialing: boolean;
  isTrialExpired: boolean;
  isActive: boolean;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  paystackCustomerCode: string | null;
  paystackSubscriptionCode: string | null;
}

export interface PaymentSuccessActivationParams {
  reference: string;
  businessId: string;
  planCode: PlanCode;
  amountNaira: number;
  currency?: string;
  provider?: "FLUTTERWAVE" | "PAYSTACK";
  customerCode?: string | null;
  subscriptionCode?: string | null;
  planPaystackCode?: string | null;
  flwRef?: string | null;
  flwTransactionId?: string | number | null;
  flwPlanId?: string | null;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotently records a verified Paystack payment and updates the tenant subscription to ACTIVE.
 * Used by both the Paystack webhook handler and synchronous return verification fallback.
 */
export async function recordSuccessfulPaymentAndActivate(params: PaymentSuccessActivationParams) {
  await ensureDefaultPlans();

  const plan = await prisma.plan.findUnique({
    where: { code: params.planCode },
  });

  if (!plan) {
    throw new Error(`Plan definition for ${params.planCode} not found.`);
  }

  // Validate Currency (NGN only)
  const currency = (params.currency || "NGN").toUpperCase();
  if (currency !== "NGN") {
    throw new Error(`Invalid payment currency: ${params.currency}. Only NGN is supported.`);
  }

  // Validate Amount vs Canonical Plan Price (Zero Client Trust)
  const canonicalPlan = PLAN_DEFINITIONS[params.planCode];
  const expectedPrice = canonicalPlan ? canonicalPlan.monthlyPrice : Number(plan.monthlyPrice);
  if (params.amountNaira < expectedPrice) {
    throw new Error(
      `Invalid payment amount: received ₦${params.amountNaira}, expected ₦${expectedPrice} for plan ${params.planCode}.`
    );
  }

  // Validate Business Existence
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
  });
  if (!business) {
    throw new Error(`Business with ID ${params.businessId} not found.`);
  }

  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. Upsert payment record
  const payment = await prisma.payment.upsert({
    where: { paystackReference: params.reference },
    create: {
      businessId: params.businessId,
      paystackReference: params.reference,
      amount: params.amountNaira.toFixed(2),
      currency,
      status: "SUCCESS",
      eventType: params.eventType || "charge.success",
      metadata: (params.metadata as Prisma.InputJsonValue) || undefined,
    },
    update: {
      status: "SUCCESS",
      eventType: params.eventType || "charge.success",
      metadata: (params.metadata as Prisma.InputJsonValue) || undefined,
    },
  });

  // 2. Upsert subscription record to ACTIVE
  const subscription = await prisma.subscription.upsert({
    where: { businessId: params.businessId },
    create: {
      businessId: params.businessId,
      planId: plan.id,
      status: "ACTIVE",
      paystackCustomerCode: params.customerCode || null,
      paystackSubscriptionCode: params.subscriptionCode || null,
      paystackPlanCode: params.planPaystackCode || null,
      currentPeriodStart: now,
      currentPeriodEnd: thirtyDaysLater,
      cancelledAt: null,
    },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      paystackCustomerCode: params.customerCode || undefined,
      paystackSubscriptionCode: params.subscriptionCode || undefined,
      paystackPlanCode: params.planPaystackCode || undefined,
      currentPeriodStart: now,
      currentPeriodEnd: thirtyDaysLater,
      cancelledAt: null,
    },
  });

  // 3. Associate payment to subscription
  await prisma.payment.update({
    where: { id: payment.id },
    data: { subscriptionId: subscription.id },
  });

  return { payment, subscription };
}

/**
 * Creates a default 14-Day STARTER Trial subscription for a newly registered business.
 */
export async function createInitialTrialSubscription(
  businessId: string,
  now = new Date()
) {
  await ensureDefaultPlans();

  const starterPlan = await prisma.plan.findUnique({
    where: { code: "STARTER" },
  });

  if (!starterPlan) {
    throw new Error("Starter plan definition not found in database.");
  }

  const trialPeriodDays = 14;
  const trialEndsAt = new Date(now.getTime() + trialPeriodDays * 24 * 60 * 60 * 1000);

  return prisma.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      planId: starterPlan.id,
      status: "TRIALING",
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
    },
    update: {
      planId: starterPlan.id,
      status: "TRIALING",
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
    },
    include: { plan: true },
  });
}

/**
 * Resolves the active subscription state for a business, with deterministic
 * server-side evaluation of trial expiration and fallback to FREE.
 */
export async function getBusinessSubscription(
  businessId: string,
  referenceDate = new Date()
): Promise<EffectiveSubscriptionState> {
  await ensureDefaultPlans();

  let sub = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });

  // If no subscription exists (e.g. existing/backfilled business), provision the 14-day PRO trial
  if (!sub) {
    sub = await createInitialTrialSubscription(businessId, referenceDate);
  }

  const rawStatus = sub.status;
  const rawPlanCode = sub.plan.code as PlanCode;

  let effectivePlanCode: PlanCode = rawPlanCode;
  let effectiveStatus: SubscriptionStatus = rawStatus;
  let isTrialExpired = false;
  let isTrialing = rawStatus === "TRIALING";
  let isActive = rawStatus === "ACTIVE";

  // Server-side dynamic trial evaluation:
  // If TRIALING and referenceDate is past trialEndsAt, fall back to FREE
  if (rawStatus === "TRIALING") {
    if (sub.trialEndsAt && referenceDate > sub.trialEndsAt) {
      isTrialExpired = true;
      isTrialing = false;
      effectiveStatus = "EXPIRED";
      effectivePlanCode = "FREE"; // Fallback to FREE tier
    }
  } else if (rawStatus === "ACTIVE") {
    if (sub.currentPeriodEnd && referenceDate > sub.currentPeriodEnd) {
      effectiveStatus = "PAST_DUE";
      isActive = false;
    }
  }

  const planDef = PLAN_DEFINITIONS[effectivePlanCode] || PLAN_DEFINITIONS.FREE;

  return {
    subscriptionId: sub.id,
    businessId: sub.businessId,
    planCode: effectivePlanCode,
    plan: planDef,
    status: effectiveStatus,
    isTrialing,
    isTrialExpired,
    isActive: isActive || (isTrialing && !isTrialExpired),
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEndsAt: sub.trialEndsAt,
    paystackCustomerCode: sub.paystackCustomerCode,
    paystackSubscriptionCode: sub.paystackSubscriptionCode,
  };
}

/**
 * Returns the effective plan definition for the business.
 */
export async function getBusinessPlan(
  businessId: string,
  referenceDate = new Date()
): Promise<PlanDefinition & { isTrial: boolean; status: SubscriptionStatus }> {
  const subState = await getBusinessSubscription(businessId, referenceDate);
  return {
    ...subState.plan,
    isTrial: subState.isTrialing,
    status: subState.status,
  };
}

/**
 * Checks if the business currently has access to a specific feature key.
 */
export async function hasFeature(
  businessId: string,
  feature: FeatureKey,
  referenceDate = new Date()
): Promise<boolean> {
  const subState = await getBusinessSubscription(businessId, referenceDate);
  const allowedPlans = FEATURE_PLAN_MAP[feature] || [];
  return allowedPlans.includes(subState.planCode);
}

/**
 * Checks if the business has an active subscription or unexpired trial.
 */
export async function isSubscriptionActive(
  businessId: string,
  referenceDate = new Date()
): Promise<boolean> {
  const subState = await getBusinessSubscription(businessId, referenceDate);
  return subState.isActive;
}
