"use server";

import { prisma } from "../prisma";
import { requireBusinessRole } from "../auth-helpers";
import { Role } from "../../types/auth";
import { PlanCode } from "@prisma/client";
import { initializePaystackTransaction } from "../payments/paystack";
import { getBusinessSubscription, getBusinessPlan } from "../subscriptions/service";
import { getAIUsage } from "../subscriptions/quotas";

export interface CheckoutActionResult {
  success?: boolean;
  authorizationUrl?: string;
  reference?: string;
  error?: string;
  simulated?: boolean;
}

/**
 * Initializes a secure Paystack checkout session to purchase or upgrade a subscription plan.
 * The price and currency are ALWAYS derived server-side from the Plan database record.
 */
export async function initializePlanCheckoutAction(
  businessId: string,
  targetPlanCode: string,
  callbackUrl?: string
): Promise<CheckoutActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    if (!context.user.email) {
      return { error: "Your user profile must have an email address to initialize checkout." };
    }

    const validCodes: PlanCode[] = ["STARTER", "PRO", "BUSINESS"];
    const code = targetPlanCode.toUpperCase() as PlanCode;

    if (!validCodes.includes(code)) {
      return { error: "Invalid subscription plan selected." };
    }

    // Resolve plan price and configuration from database (Zero Client Trust)
    const plan = await prisma.plan.findUnique({
      where: { code },
    });

    if (!plan || !plan.isActive) {
      return { error: "The requested subscription plan is currently unavailable." };
    }

    const priceNaira = Number(plan.monthlyPrice);
    if (priceNaira <= 0) {
      return { error: "Free plans do not require payment processing." };
    }

    const amountInKobo = Math.round(priceNaira * 100);
    const reference = `bp_sub_${context.business.id.slice(-6)}_${Date.now()}`;

    const metadata = {
      businessId: context.business.id,
      userId: context.user.id,
      planCode: plan.code,
      planId: plan.id,
    };

    const paystackRes = await initializePaystackTransaction({
      email: context.user.email,
      amountInKobo,
      reference,
      callbackUrl,
      metadata,
    });

    if (!paystackRes.success) {
      return { error: paystackRes.error || "Failed to initialize payment gateway." };
    }

    return {
      success: true,
      authorizationUrl: paystackRes.authorizationUrl,
      reference: paystackRes.reference,
      simulated: paystackRes.simulated,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout initialization failed";
    return { error: message };
  }
}

/**
 * Returns the current subscription details and AI usage metrics for dashboard display.
 */
export async function getSubscriptionDetailsAction(businessId: string) {
  try {
    await requireBusinessRole(businessId, Role.MEMBER);

    const subscription = await getBusinessSubscription(businessId);
    const plan = await getBusinessPlan(businessId);
    const aiUsage = await getAIUsage(businessId);

    return {
      success: true,
      subscription,
      plan,
      aiUsage,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load subscription details",
    };
  }
}
