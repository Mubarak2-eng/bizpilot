import { redirect } from "next/navigation";
import { getActiveBusiness, requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  getBusinessSubscription,
  recordSuccessfulPaymentAndActivate,
} from "@/lib/subscriptions/service";
import { getAIUsage } from "@/lib/subscriptions/quotas";
import { verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { verifyPaystackTransaction } from "@/lib/payments/paystack";
import { PlanCode } from "@prisma/client";
import SettingsManager, {
  TeamMember,
  SubscriptionData,
  AIUsageData,
} from "@/components/settings-manager";

export const metadata = {
  title: "Settings & Team | BizPilot AI",
  description: "Business configuration, currency, subscriptions, and team role permissions",
};

interface SettingsPageProps {
  searchParams?: Promise<{
    reference?: string;
    trxref?: string;
    tx_ref?: string;
    transaction_id?: string;
    status?: string;
  }>;
}

export default async function SettingsPage(props: SettingsPageProps) {
  const user = await requireAuth().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const activeContext = await getActiveBusiness();
  if (!activeContext) {
    redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const queryRef = searchParams.tx_ref || searchParams.transaction_id || searchParams.reference || searchParams.trxref;
  let initialFeedback: { message?: string; error?: string } | null = null;

  // Server-side synchronous verification fallback if returning from Flutterwave/Paystack redirect
  if (queryRef) {
    try {
      if (searchParams.status && searchParams.status === "cancelled") {
        initialFeedback = {
          error: "Payment was cancelled. Your subscription was not charged.",
        };
      } else if (queryRef.startsWith("bp_flw_") || searchParams.tx_ref || searchParams.transaction_id) {
        const verifyRes = await verifyFlutterwaveTransaction(queryRef);
        if (verifyRes.success && verifyRes.data) {
          const data = verifyRes.data;
          const status = data.status.toLowerCase();

          if (status === "successful" || status === "success") {
            const metaBizId = data.meta?.businessId as string | undefined;
            const metaPlanCode = data.meta?.planCode as PlanCode | undefined;

            // Zero-trust check: verify transaction metadata matches active business
            if (!metaBizId || metaBizId === activeContext.business.id) {
              const resolvedPlanCode: PlanCode = metaPlanCode || "PRO";
              const amountNaira = Number(data.amount || data.charged_amount || 0);
              const currency = (data.currency || "NGN").toUpperCase();

              if (currency === "NGN") {
                await recordSuccessfulPaymentAndActivate({
                  reference: data.tx_ref || queryRef,
                  businessId: activeContext.business.id,
                  planCode: resolvedPlanCode,
                  amountNaira,
                  currency,
                  provider: "FLUTTERWAVE",
                  flwRef: data.flw_ref,
                  flwTransactionId: data.id,
                  customerCode: data.customer?.id ? String(data.customer.id) : data.customer?.email,
                  eventType: "charge.completed",
                  metadata: data.meta,
                });

                initialFeedback = {
                  message: `🎉 Payment confirmed! Your ${resolvedPlanCode} subscription is now ACTIVE.`,
                };
              }
            } else {
              initialFeedback = {
                error: "Payment verification failed: Transaction belongs to another business workspace.",
              };
            }
          } else {
            initialFeedback = {
              error: `Payment status is ${data.status}. Subscription could not be activated.`,
            };
          }
        }
      } else {
        // Fallback for legacy Paystack verification
        const verifyRes = await verifyPaystackTransaction(queryRef);
        if (verifyRes.success && verifyRes.data && verifyRes.data.status === "success") {
          const data = verifyRes.data;
          const metaBizId = data.metadata?.businessId as string | undefined;
          const metaPlanCode = data.metadata?.planCode as PlanCode | undefined;

          if (!metaBizId || metaBizId === activeContext.business.id) {
            const resolvedPlanCode: PlanCode = metaPlanCode || "PRO";
            const amountNaira = (data.amount || 0) / 100;
            const currency = (data.currency || "NGN").toUpperCase();

            if (currency === "NGN") {
              await recordSuccessfulPaymentAndActivate({
                reference: data.reference || queryRef,
                businessId: activeContext.business.id,
                planCode: resolvedPlanCode,
                amountNaira,
                currency,
                customerCode: data.customer?.customer_code,
                subscriptionCode: data.subscription_code,
                planPaystackCode: data.plan,
                eventType: "charge.success",
                metadata: data.metadata,
              });

              initialFeedback = {
                message: `🎉 Payment confirmed! Your ${resolvedPlanCode} subscription is now ACTIVE.`,
              };
            }
          } else {
            initialFeedback = {
              error: "Payment verification failed: Transaction belongs to another business workspace.",
            };
          }
        }
      }
    } catch (err: unknown) {
      console.error("[Settings Page Payment Verification Error]", err);
      initialFeedback = {
        error: err instanceof Error ? err.message : "Failed to verify transaction with payment provider.",
      };
    }
  }

  const businessWithMembers = await prisma.business.findUnique({
    where: { id: activeContext.business.id },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!businessWithMembers) {
    redirect("/login");
  }

  const whatsAppConnection = await prisma.whatsAppConnection.findUnique({
    where: { businessId: activeContext.business.id },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  // Fetch updated subscription & AI quota usage
  const subState = await getBusinessSubscription(activeContext.business.id);
  const aiUsage = await getAIUsage(activeContext.business.id);

  const formattedMembers: TeamMember[] = businessWithMembers.memberships.map((m) => ({
    id: m.id,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
    },
  }));

  const formattedWhatsApp = whatsAppConnection
    ? {
        id: whatsAppConnection.id,
        phoneNumber: whatsAppConnection.phoneNumber,
        verified: whatsAppConnection.verified,
        createdAt: whatsAppConnection.createdAt.toISOString(),
        updatedAt: whatsAppConnection.updatedAt.toISOString(),
        linkedByUser: whatsAppConnection.user
          ? {
              name: whatsAppConnection.user.name,
              email: whatsAppConnection.user.email,
            }
          : undefined,
      }
    : null;

  const formattedSubscription: SubscriptionData = {
    planCode: subState.planCode,
    planName: subState.plan.name,
    monthlyPrice: subState.plan.monthlyPrice,
    currency: subState.plan.currency,
    status: subState.status,
    isTrialing: subState.isTrialing,
    isTrialExpired: subState.isTrialExpired,
    trialEndsAt: subState.trialEndsAt ? subState.trialEndsAt.toISOString() : null,
    currentPeriodEnd: subState.currentPeriodEnd.toISOString(),
  };

  const formattedAIUsage: AIUsageData = {
    queryCount: aiUsage.queryCount,
    limit: aiUsage.limit,
    remaining: aiUsage.remaining,
    isExhausted: aiUsage.isExhausted,
  };

  return (
    <SettingsManager
      business={{
        id: businessWithMembers.id,
        name: businessWithMembers.name,
        slug: businessWithMembers.slug,
        businessType: businessWithMembers.businessType,
        currency: businessWithMembers.currency,
        createdAt: businessWithMembers.createdAt.toISOString(),
      }}
      currentUserRole={activeContext.role}
      members={formattedMembers}
      whatsAppConnection={formattedWhatsApp}
      subscription={formattedSubscription}
      aiUsage={formattedAIUsage}
      initialFeedback={initialFeedback}
    />
  );
}
