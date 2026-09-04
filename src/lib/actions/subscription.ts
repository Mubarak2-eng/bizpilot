"use server";

import { prisma } from "../prisma";
import { requireBusinessRole } from "../auth-helpers";
import { Role } from "../../types/auth";
import { PlanCode } from "@prisma/client";
import { initializePaystackTransaction } from "../payments/paystack";
import { getBusinessSubscription, getBusinessPlan, recordSuccessfulPaymentAndActivate } from "../subscriptions/service";
import { getAIUsage } from "../subscriptions/quotas";
import { verifyPaystackTransaction } from "../payments/paystack";

export interface CheckoutActionResult {
  success?: boolean;
  authorizationUrl?: string;
  reference?: string;
  error?: string;
  simulated?: boolean;
}

export interface VerifyPaymentActionResult {
  success: boolean;
  planCode?: PlanCode;
  reference?: string;
  message?: string;
  error?: string;
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
 * Synchronously verifies a Paystack payment upon return redirect from checkout.
 * Enforces zero-trust authentication, tenant isolation, amount and currency checks.
 */
export async function verifyPaymentAction(
  businessId: string,
  reference: string
): Promise<VerifyPaymentActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    if (!reference || reference.trim() === "") {
      return { success: false, error: "Transaction reference is required." };
    }

    // 1. Verify transaction with Paystack gateway
    const verifyRes = await verifyPaystackTransaction(reference);
    if (!verifyRes.success || !verifyRes.data) {
      return {
        success: false,
        error: verifyRes.error || "Payment verification failed with payment gateway.",
      };
    }

    const txData = verifyRes.data;

    // 2. Validate status
    if (txData.status !== "success") {
      return {
        success: false,
        error: `Payment status is '${txData.status}'. Only successful payments can activate a subscription.`,
      };
    }

    // 3. Cross-Tenant Protection: Verify businessId in metadata matches authenticated business
    const metaBizId = txData.metadata?.businessId as string | undefined;
    if (metaBizId && metaBizId !== context.business.id) {
      return {
        success: false,
        error: "Unauthorized: This payment belongs to another business workspace.",
      };
    }

    // 4. Validate Currency (Must be NGN)
    if (txData.currency && txData.currency.toUpperCase() !== "NGN") {
      return {
        success: false,
        error: `Invalid payment currency: ${txData.currency}. Only NGN is supported.`,
      };
    }

    // 5. Determine target plan (Default to PRO if unspecified)
    const rawPlanCode = (txData.metadata?.planCode as string) || "PRO";
    const planCode = rawPlanCode.toUpperCase() as PlanCode;

    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan || !plan.isActive) {
      return {
        success: false,
        error: `Subscription plan ${planCode} is not available.`,
      };
    }

    // 6. Validate Amount vs Plan Price
    const amountNaira = (txData.amount || 0) / 100;
    const expectedPrice = Number(plan.monthlyPrice);
    if (amountNaira < expectedPrice) {
      return {
        success: false,
        error: `Underpayment: received ₦${amountNaira}, expected ₦${expectedPrice} for plan ${planCode}.`,
      };
    }

    // 7. Idempotently record payment and activate subscription
    await recordSuccessfulPaymentAndActivate({
      reference: txData.reference || reference,
      businessId: context.business.id,
      planCode,
      amountNaira,
      currency: txData.currency || "NGN",
      customerCode: txData.customer?.customer_code,
      subscriptionCode: txData.subscription_code,
      planPaystackCode: txData.plan,
      eventType: "charge.success",
      metadata: txData.metadata,
    });

    return {
      success: true,
      planCode,
      reference: txData.reference || reference,
      message: `🎉 Payment confirmed! Your ${planCode} subscription is now ACTIVE.`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Payment verification failed";
    return { success: false, error: errorMsg };
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
