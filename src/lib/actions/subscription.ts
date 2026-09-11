"use server";

import { prisma } from "../prisma";
import { requireBusinessRole } from "../auth-helpers";
import { Role } from "../../types/auth";
import { PlanCode } from "@prisma/client";
import {
  initializeFlutterwaveTransaction,
  verifyFlutterwaveTransaction,
} from "../payments/flutterwave";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from "../payments/paystack";
import {
  getBusinessSubscription,
  getBusinessPlan,
  recordSuccessfulPaymentAndActivate,
  ensureDefaultPlans,
} from "../subscriptions/service";
import { PLAN_DEFINITIONS } from "../subscriptions/plans";
import { getAIUsage } from "../subscriptions/quotas";

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
 * Initializes a secure Flutterwave checkout session to purchase or upgrade a subscription plan.
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

    // Ensure database plans are synced to latest definitions
    await ensureDefaultPlans();

    // Resolve plan price and configuration from database & canonical definitions (Zero Client Trust)
    const plan = await prisma.plan.findUnique({
      where: { code },
    });

    if (!plan || !plan.isActive) {
      return { error: "The requested subscription plan is currently unavailable." };
    }

    const canonicalPlan = PLAN_DEFINITIONS[code];
    const priceNaira = canonicalPlan ? canonicalPlan.monthlyPrice : Number(plan.monthlyPrice);
    if (priceNaira <= 0) {
      return { error: "Free plans do not require payment processing." };
    }

    const txRef = `bp_flw_${context.business.id.slice(-6)}_${Date.now()}`;

    const metadata = {
      businessId: context.business.id,
      userId: context.user.id,
      planCode: plan.code,
      planId: plan.id,
    };

    const flwRes = await initializeFlutterwaveTransaction({
      email: context.user.email,
      name: context.user.name || undefined,
      amountInNaira: priceNaira,
      currency: "NGN",
      txRef,
      redirectUrl: callbackUrl,
      metadata,
    });

    if (!flwRes.success) {
      return { error: flwRes.error || "Failed to initialize Flutterwave payment gateway." };
    }

    return {
      success: true,
      authorizationUrl: flwRes.paymentLink,
      reference: flwRes.txRef,
      simulated: flwRes.simulated,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout initialization failed";
    return { error: message };
  }
}

/**
 * Synchronously verifies a payment upon return redirect from Flutterwave checkout.
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

    // 1. Verify transaction with Flutterwave gateway (with fallback for legacy Paystack references)
    let isSuccess = false;
    let status = "failed";
    let amountNaira = 0;
    let currency = "NGN";
    let verifiedRef = reference;
    let metaBizId: string | undefined;
    let metaPlanCode: string | undefined;
    let flwRef: string | undefined;
    let flwTransactionId: number | string | undefined;
    let rawMetadata: Record<string, unknown> | undefined;

    if (reference.startsWith("bp_flw_") || !reference.startsWith("bp_sub_")) {
      const verifyRes = await verifyFlutterwaveTransaction(reference);
      if (verifyRes.success && verifyRes.data) {
        const d = verifyRes.data;
        status = d.status.toLowerCase();
        isSuccess = status === "successful" || status === "success";
        amountNaira = Number(d.amount || d.charged_amount || 0);
        currency = (d.currency || "NGN").toUpperCase();
        verifiedRef = d.tx_ref || reference;
        flwRef = d.flw_ref;
        flwTransactionId = d.id;
        rawMetadata = d.meta;
        metaBizId = d.meta?.businessId as string | undefined;
        metaPlanCode = d.meta?.planCode as string | undefined;
      }
    } else {
      // Legacy Paystack fallback verification
      const verifyRes = await verifyPaystackTransaction(reference);
      if (verifyRes.success && verifyRes.data) {
        const d = verifyRes.data;
        status = d.status.toLowerCase();
        isSuccess = status === "success";
        amountNaira = (d.amount || 0) / 100;
        currency = (d.currency || "NGN").toUpperCase();
        verifiedRef = d.reference || reference;
        rawMetadata = d.metadata;
        metaBizId = d.metadata?.businessId as string | undefined;
        metaPlanCode = d.metadata?.planCode as string | undefined;
      }
    }

    // 2. Validate status
    if (!isSuccess) {
      return {
        success: false,
        error: `Payment status is '${status}'. Only successful payments can activate a subscription.`,
      };
    }

    // 3. Cross-Tenant Protection: Verify businessId in metadata matches authenticated business
    if (metaBizId && metaBizId !== context.business.id) {
      return {
        success: false,
        error: "Unauthorized: This payment belongs to another business workspace.",
      };
    }

    // 4. Validate Currency (Must be NGN)
    if (currency !== "NGN") {
      return {
        success: false,
        error: `Invalid payment currency: ${currency}. Only NGN is supported.`,
      };
    }

    // 5. Determine target plan (Default to PRO if unspecified)
    await ensureDefaultPlans();
    const rawPlan = metaPlanCode || "PRO";
    const planCode = rawPlan.toUpperCase() as PlanCode;

    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan || !plan.isActive) {
      return {
        success: false,
        error: `Subscription plan ${planCode} is not available.`,
      };
    }

    // 6. Validate Amount vs Canonical Plan Price
    const canonicalPlan = PLAN_DEFINITIONS[planCode];
    const expectedPrice = canonicalPlan ? canonicalPlan.monthlyPrice : Number(plan.monthlyPrice);
    if (amountNaira < expectedPrice) {
      return {
        success: false,
        error: `Underpayment: received ₦${amountNaira}, expected ₦${expectedPrice} for plan ${planCode}.`,
      };
    }

    // 7. Idempotently record payment and activate subscription
    await recordSuccessfulPaymentAndActivate({
      reference: verifiedRef,
      businessId: context.business.id,
      planCode,
      amountNaira,
      currency,
      provider: verifiedRef.startsWith("bp_flw_") ? "FLUTTERWAVE" : "PAYSTACK",
      flwRef,
      flwTransactionId,
      eventType: "charge.completed",
      metadata: rawMetadata,
    });

    return {
      success: true,
      planCode,
      reference: verifiedRef,
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
