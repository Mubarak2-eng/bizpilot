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

    // Cryptographic signature check (Fail-closed in production)
    const isValid = verifyPaystackWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn("[Paystack Webhook Security] Invalid or missing signature rejected.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    if (!rawBody) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.event;
    const data = payload.data || {};

    const reference: string = data.reference || `evt_${data.id || Date.now()}`;
    const businessId: string | undefined = data.metadata?.businessId;
    const planCode: PlanCode | undefined = data.metadata?.planCode;

    // 1. Check for duplicate webhook processing (Idempotency Guard)
    const existingPayment = await prisma.payment.findUnique({
      where: { paystackReference: reference },
    });

    if (existingPayment && existingPayment.status === "SUCCESS") {
      console.log(`[Paystack Webhook] Duplicate event skipped for reference ${reference}`);
      return NextResponse.json({ status: "already_processed", reference });
    }

    await ensureDefaultPlans();

    // 2. Process specific Paystack lifecycle events
    if (eventType === "charge.success") {
      if (businessId && planCode) {
        const amountNaira = Number(data.amount) / 100;

        await recordSuccessfulPaymentAndActivate({
          reference,
          businessId,
          planCode,
          amountNaira,
          currency: data.currency || "NGN",
          customerCode: data.customer?.customer_code,
          subscriptionCode: data.subscription_code,
          planPaystackCode: data.plan?.plan_code || data.plan,
          eventType,
          metadata: data,
        });

        console.log(
          `[Paystack Webhook] Successfully activated ${planCode} for business ${businessId} (Ref: ${reference})`
        );
      }
    } else if (eventType === "invoice.payment_failed") {
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
