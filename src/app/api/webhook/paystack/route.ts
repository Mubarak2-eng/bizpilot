import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { verifyPaystackWebhookSignature } from "../../../../lib/payments/paystack";
import { PlanCode } from "@prisma/client";
import {
  ensureDefaultPlans,
  recordSuccessfulPaymentAndActivate,
} from "../../../../lib/subscriptions/service";

/**
 * Paystack Webhook Handler
 * Verifies HMAC-SHA512 signature, ensures idempotency, and updates subscription state.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!rawBody || rawBody.trim() === "") {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    // Cryptographic signature check (Fail-closed in production)
    const isValid = verifyPaystackWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn("[Paystack Webhook Security] Invalid or missing signature rejected.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType = payload.event as string;
    const data = (payload.data as Record<string, unknown>) || {};
    const metadata = (data.metadata as Record<string, unknown>) || {};

    const reference = (data.reference as string) || `evt_${data.id || Date.now()}`;
    const businessId = metadata.businessId as string | undefined;
    const planCodeRaw = metadata.planCode as string | undefined;

    // 1. Check for duplicate webhook processing (Idempotency Guard)
    const existingPayment = await prisma.payment.findUnique({
      where: { paystackReference: reference },
    });

    if (existingPayment && existingPayment.status === "SUCCESS") {
      console.log(`[Paystack Webhook] Duplicate event skipped for reference ${reference}`);
      return NextResponse.json({ status: "already_processed", reference }, { status: 200 });
    }

    await ensureDefaultPlans();

    // 2. Process specific Paystack lifecycle events
    if (eventType === "charge.success") {
      // Validate payment status
      if (data.status && data.status !== "success") {
        console.warn(`[Paystack Webhook Security] Charge.success event with status '${data.status}' rejected.`);
        return NextResponse.json({ error: "Transaction status is not successful" }, { status: 400 });
      }

      if (!businessId) {
        console.warn("[Paystack Webhook Security] Missing businessId in transaction metadata.");
        return NextResponse.json({ error: "Missing businessId in metadata" }, { status: 400 });
      }

      // Validate tenant exists in database
      const business = await prisma.business.findUnique({
        where: { id: businessId },
      });
      if (!business) {
        console.warn(`[Paystack Webhook Security] Unknown businessId ${businessId} in metadata.`);
        return NextResponse.json({ error: "Business not found" }, { status: 400 });
      }

      // Validate currency (Must be NGN)
      const currency = ((data.currency as string) || "NGN").toUpperCase();
      if (currency !== "NGN") {
        console.warn(`[Paystack Webhook Security] Invalid currency ${currency} rejected.`);
        return NextResponse.json({ error: "Invalid currency: Only NGN is supported" }, { status: 400 });
      }

      // Validate plan
      const planCode = (planCodeRaw?.toUpperCase() || "PRO") as PlanCode;
      const plan = await prisma.plan.findUnique({
        where: { code: planCode },
      });
      if (!plan || !plan.isActive) {
        return NextResponse.json({ error: `Plan ${planCode} is not available` }, { status: 400 });
      }

      // Validate amount vs plan monthly price (Zero Client Trust)
      const amountNaira = Number(data.amount) / 100;
      const expectedPrice = Number(plan.monthlyPrice);
      if (amountNaira < expectedPrice) {
        console.warn(
          `[Paystack Webhook Security] Underpayment rejected: received ₦${amountNaira}, expected ₦${expectedPrice}`
        );
        return NextResponse.json(
          { error: `Underpayment: received ₦${amountNaira}, expected ₦${expectedPrice}` },
          { status: 400 }
        );
      }

      const customer = data.customer as Record<string, unknown> | undefined;
      const planObj = data.plan as Record<string, unknown> | string | undefined;
      const planPaystackCode = typeof planObj === "object" && planObj ? (planObj.plan_code as string) : (planObj as string);

      await recordSuccessfulPaymentAndActivate({
        reference,
        businessId,
        planCode,
        amountNaira,
        currency,
        customerCode: customer?.customer_code as string | undefined,
        subscriptionCode: data.subscription_code as string | undefined,
        planPaystackCode,
        eventType,
        metadata: data,
      });

      console.log(
        `[Paystack Webhook] Successfully activated ${planCode} for business ${businessId} (Ref: ${reference})`
      );
    } else if (eventType === "invoice.payment_failed" || eventType === "charge.failed") {
      if (businessId) {
        await prisma.subscription.updateMany({
          where: { businessId },
          data: { status: "PAST_DUE" },
        });
        console.warn(`[Paystack Webhook] Marked subscription PAST_DUE for business ${businessId}`);
      }
    } else if (eventType === "subscription.disable" || eventType === "subscription.not_renew") {
      if (businessId) {
        await prisma.subscription.updateMany({
          where: { businessId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
          },
        });
        console.log(`[Paystack Webhook] Marked subscription CANCELLED for business ${businessId}`);
      }
    }

    return NextResponse.json({
      status: "success",
      event: eventType,
      received: true,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    console.error(`[Paystack Webhook Error] ${errorMsg}`);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
