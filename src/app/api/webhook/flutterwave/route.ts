import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { verifyFlutterwaveWebhookSignature } from "../../../../lib/payments/flutterwave";
import {
  recordSuccessfulPaymentAndActivate,
  ensureDefaultPlans,
} from "../../../../lib/subscriptions/service";
import { PLAN_DEFINITIONS } from "../../../../lib/subscriptions/plans";
import { PlanCode } from "@prisma/client";

/**
 * Flutterwave Webhook Handler
 * Receives charge.completed and subscription payment lifecycle events.
 * Enforces timing-safe verif-hash validation, tenant isolation, and amount verification.
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("verif-hash");
    const isValid = verifyFlutterwaveWebhookSignature(signature);

    if (!isValid) {
      console.warn("[Flutterwave Webhook Security] Invalid or missing verif-hash signature rejected.");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || !payload.data) {
      return NextResponse.json({ error: "Invalid webhook payload structure" }, { status: 400 });
    }

    const event = payload.event || payload["event.type"] || "charge.completed";
    const data = payload.data;
    const txRef = data.tx_ref;
    const flwRef = data.flw_ref;
    const transactionId = data.id;

    if (!txRef) {
      console.warn("[Flutterwave Webhook Security] Webhook payload missing tx_ref.");
      return NextResponse.json({ error: "Missing tx_ref in payload data" }, { status: 400 });
    }

    // 1. Idempotency Check: if this payment reference was already successfully processed, return 200 immediately
    const existingPayment = await prisma.payment.findUnique({
      where: { paystackReference: txRef },
    });

    if (existingPayment && existingPayment.status === "SUCCESS") {
      console.log(`[Flutterwave Webhook] Duplicate event skipped for tx_ref ${txRef}`);
      return NextResponse.json({ received: true, note: "duplicate_skipped" }, { status: 200 });
    }

    // 2. Handle non-successful status (failed / cancelled / pending)
    const status = String(data.status || "").toLowerCase();
    if (status !== "successful") {
      console.warn(`[Flutterwave Webhook Security] Charge event with status '${data.status}' rejected.`);
      
      // If payment record exists, mark as FAILED
      if (existingPayment) {
        await prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: "FAILED", eventType: event },
        });
      }
      return NextResponse.json({ received: true, note: "non_successful_status_ignored" }, { status: 200 });
    }

    // 3. Extract and Validate Metadata
    const metadata = data.meta || {};
    const businessId = (metadata.businessId as string) || (data.customer?.meta?.businessId as string);

    if (!businessId) {
      console.warn("[Flutterwave Webhook Security] Missing businessId in transaction metadata.");
      return NextResponse.json({ error: "Missing businessId in transaction metadata" }, { status: 400 });
    }

    // Cross-tenant verification: verify business exists
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      console.warn(`[Flutterwave Webhook Security] Unknown businessId ${businessId} in metadata.`);
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // 4. Validate Currency (Must be NGN)
    const currency = String(data.currency || "NGN").toUpperCase();
    if (currency !== "NGN") {
      console.warn(`[Flutterwave Webhook Security] Invalid currency ${currency} rejected.`);
      return NextResponse.json({ error: "Invalid payment currency. Only NGN supported." }, { status: 400 });
    }

    // 5. Validate Amount against Plan Definition (Zero Client Trust)
    await ensureDefaultPlans();
    const rawPlanCode = (metadata.planCode as string) || "PRO";
    const planCode = rawPlanCode.toUpperCase() as PlanCode;

    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan || !plan.isActive) {
      console.warn(`[Flutterwave Webhook Security] Unknown or inactive plan ${planCode}.`);
      return NextResponse.json({ error: "Invalid target subscription plan" }, { status: 400 });
    }

    const canonicalPlan = PLAN_DEFINITIONS[planCode];
    const expectedPrice = canonicalPlan ? canonicalPlan.monthlyPrice : Number(plan.monthlyPrice);
    const amountNaira = Number(data.amount || data.charged_amount || 0);

    if (amountNaira < expectedPrice) {
      console.error(
        `[Flutterwave Webhook Security] Underpayment rejected: received NGN ${amountNaira}, expected NGN ${expectedPrice}`
      );
      return NextResponse.json({ error: "Underpayment rejected" }, { status: 400 });
    }

    // 6. Record verified payment and activate subscription
    await recordSuccessfulPaymentAndActivate({
      reference: txRef,
      businessId,
      planCode,
      amountNaira,
      currency,
      provider: "FLUTTERWAVE",
      flwRef,
      flwTransactionId: transactionId,
      customerCode: data.customer?.id ? String(data.customer.id) : data.customer?.email,
      eventType: event,
      metadata: {
        ...metadata,
        flwTransactionId: transactionId,
        flwRef,
        customerEmail: data.customer?.email,
      },
    });

    console.log(
      `[Flutterwave Webhook] Successfully activated ${planCode} for business ${businessId} (tx_ref: ${txRef})`
    );

    return NextResponse.json({ received: true, status: "activated" }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Webhook processing error";
    console.error(`[Flutterwave Webhook Error] ${errorMsg}`);
    return NextResponse.json({ error: "Internal webhook handler error" }, { status: 500 });
  }
}