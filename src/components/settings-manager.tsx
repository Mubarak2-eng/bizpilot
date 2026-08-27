"use client";

import { useState, useTransition } from "react";
import { Role } from "@/types/auth";
import {
  requestWhatsAppLinkAction,
  verifyWhatsAppOTPAction,
  unlinkWhatsAppNumberAction,
} from "@/lib/actions/whatsapp";
import { initializePlanCheckoutAction } from "@/lib/actions/subscription";

export interface TeamMember {
  id: string;
  role: Role;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

export interface WhatsAppConnectionData {
  id: string;
  phoneNumber: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  linkedByUser?: {
    name: string | null;
    email: string | null;
  };
}

export interface SubscriptionData {
  planCode: string;
  planName: string;
  monthlyPrice: number;
  currency: string;
  status: string;
  isTrialing: boolean;
  isTrialExpired: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string;
}

export interface AIUsageData {
  queryCount: number;
  limit: number;
  remaining: number;
  isExhausted: boolean;
}

interface SettingsManagerProps {
  business: {
    id: string;
    name: string;
    slug: string;
    businessType?: string;
    currency: string;
    createdAt: string;
  };
  currentUserRole: Role;
  members: TeamMember[];
  whatsAppConnection?: WhatsAppConnectionData | null;
  subscription?: SubscriptionData | null;
  aiUsage?: AIUsageData | null;
  initialFeedback?: { message?: string; error?: string } | null;
}

export default function SettingsManager({
  business,
  currentUserRole,
  members,
  whatsAppConnection,
  subscription,
  aiUsage,
  initialFeedback,
}: SettingsManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(
    initialFeedback || null
  );

  // WhatsApp link & unlink modal states
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"PHONE" | "OTP">("PHONE");
  const [inputPhone, setInputPhone] = useState("");
  const [inputOtp, setInputOtp] = useState("");

  // Subscription upgrade modal
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>("PRO");

  const canManage = currentUserRole === "OWNER" || currentUserRole === "ADMIN";

  const roleBadges: Record<Role, { bg: string; text: string; border: string }> = {
    OWNER: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    ADMIN: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    STAFF: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    MEMBER: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
  };

  const handleRequestOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.append("phoneNumber", inputPhone);

    startTransition(async () => {
      const result = await requestWhatsAppLinkAction(business.id, formData);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ message: result.message || "Verification code sent." });
        setOtpStep("OTP");
      }
    });
  };

  const handleVerifyOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.append("code", inputOtp);

    startTransition(async () => {
      const result = await verifyWhatsAppOTPAction(business.id, formData);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ message: result.message || "WhatsApp number verified successfully." });
        setIsLinkModalOpen(false);
        setOtpStep("PHONE");
        setInputPhone("");
        setInputOtp("");
      }
    });
  };

  const handleDisconnectSubmit = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await unlinkWhatsAppNumberAction(business.id);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ message: result.message });
        setIsDisconnectModalOpen(false);
      }
    });
  };

  const handlePlanCheckout = (planCode: string) => {
    setFeedback(null);
    startTransition(async () => {
      const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}/settings` : undefined;
      const result = await initializePlanCheckoutAction(business.id, planCode, callbackUrl);
      if (result.error) {
        setFeedback({ error: result.error });
      } else if (result.authorizationUrl) {
        // Redirect browser to the Paystack checkout page
        window.location.href = result.authorizationUrl;
      } else {
        setFeedback({ error: "No authorization URL returned from payment provider." });
      }
    });
  };

  const usagePercent = aiUsage && aiUsage.limit > 0
    ? Math.min(100, Math.round((aiUsage.queryCount / aiUsage.limit) * 100))
    : 0;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          Business Profile & Settings
        </h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          Manage business configuration, subscription billing, WhatsApp bot integration, and team role permissions
        </p>
      </div>

      {/* Feedback Alerts */}
      {feedback?.message && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs md:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {feedback?.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs md:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{feedback.error}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Subscription & AI Quotas Card (Phase 6D) */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xl font-bold">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-wide">
                  {subscription?.planName || "BizPilot Plan"}
                </h2>
                {subscription?.isTrialing ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    14-DAY PRO TRIAL
                  </span>
                ) : subscription?.status === "ACTIVE" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    ACTIVE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    FREE TIER
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {subscription?.monthlyPrice && subscription.monthlyPrice > 0
                  ? `₦${subscription.monthlyPrice.toLocaleString()}/month`
                  : "Free Plan"}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-2 shadow-lg shadow-indigo-950/50"
            >
              <span>{subscription?.planCode === "BUSINESS" ? "Manage Plan" : "Upgrade Plan"}</span>
              <span>→</span>
            </button>
          )}
        </div>

        {/* AI Usage Progress Meter */}
        {aiUsage && (
          <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <span>🤖</span> AI Assistant Monthly Usage:
              </span>
              <span className="font-mono font-bold text-white">
                {aiUsage.queryCount} / {aiUsage.limit} queries
              </span>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  usagePercent >= 90
                    ? "bg-rose-500"
                    : usagePercent >= 70
                    ? "bg-amber-500"
                    : "bg-gradient-to-r from-indigo-500 to-emerald-400"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{aiUsage.remaining} queries remaining this billing cycle</span>
              {subscription?.currentPeriodEnd && (
                <span>
                  Resets on:{" "}
                  <strong className="text-slate-300">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Business Info Card */}
        <div className="md:col-span-1 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Business Details</h2>
          <div className="space-y-3 text-xs">
            <div className="py-1.5 border-b border-slate-800">
              <span className="text-slate-400 block">Organization Name:</span>
              <span className="text-white font-bold text-sm">{business.name}</span>
            </div>
            <div className="py-1.5 border-b border-slate-800">
              <span className="text-slate-400 block">Unique Slug:</span>
              <code className="text-indigo-400 font-mono text-xs">{business.slug}</code>
            </div>
            <div className="py-1.5 border-b border-slate-800">
              <span className="text-slate-400 block">Industry Type:</span>
              <span className="text-amber-400 font-bold text-sm tracking-wide">
                {business.businessType || "OTHER"}
              </span>
            </div>
            <div className="py-1.5 border-b border-slate-800">
              <span className="text-slate-400 block">Primary Currency:</span>
              <span className="text-emerald-400 font-bold text-sm">{business.currency}</span>
            </div>
            <div className="py-1.5 border-b border-slate-800">
              <span className="text-slate-400 block">Tenant ID:</span>
              <span className="text-slate-400 font-mono text-[10px] break-all">{business.id}</span>
            </div>
            <div className="py-1.5">
              <span className="text-slate-400 block">Created On:</span>
              <span className="text-slate-300">
                {new Date(business.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp Business Integration Card */}
        <div className="md:col-span-2 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-base">
                💬
              </div>
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  WhatsApp AI Integration
                </h2>
                <p className="text-[11px] text-slate-400">
                  Connect your business WhatsApp number for natural language sales and reporting
                </p>
              </div>
            </div>

            {whatsAppConnection && whatsAppConnection.verified ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VERIFIED
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-slate-800 text-slate-400 border-slate-700">
                NOT CONNECTED
              </span>
            )}
          </div>

          {whatsAppConnection && whatsAppConnection.verified ? (
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">
                    Connected Number
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-bold text-white tracking-wide">
                      +{whatsAppConnection.phoneNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                      Active
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setInputPhone(whatsAppConnection.phoneNumber);
                        setOtpStep("PHONE");
                        setIsLinkModalOpen(true);
                      }}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 disabled:opacity-50"
                    >
                      Change Number
                    </button>
                    <button
                      onClick={() => setIsDisconnectModalOpen(true)}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition border border-rose-500/20 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Connected By:</span>
                  <span className="text-slate-300 font-medium">
                    {whatsAppConnection.linkedByUser?.name || whatsAppConnection.linkedByUser?.email || "Admin"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Linked Since:</span>
                  <span className="text-slate-300 font-medium">
                    {new Date(whatsAppConnection.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10 text-[11px] text-emerald-300/90 leading-relaxed">
                💡 <strong>Bot Ready:</strong> Send messages like <em>"What were my sales today?"</em> or <em>"Record cash sale 3 Power Banks"</em> from this WhatsApp number to interact directly with your business assistant.
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  No WhatsApp Number Connected
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Link your WhatsApp phone number to enable instant natural-language sales recording, expense logging, stock lookups, and invoice generation directly from your chat.
                </p>
              </div>

              {canManage ? (
                <button
                  onClick={() => {
                    setInputPhone("");
                    setInputOtp("");
                    setOtpStep("PHONE");
                    setIsLinkModalOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 shadow-lg shadow-emerald-950/40"
                >
                  <span>Connect WhatsApp Number</span>
                  <span>→</span>
                </button>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  * Only business Owners and Admins can connect or modify WhatsApp integration.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Team Members & Roles */}
        <div className="md:col-span-3 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Team Members ({members.length})
            </h2>
            <span className="text-xs text-slate-400">
              Your Role: <strong className={roleBadges[currentUserRole]?.text}>{currentUserRole}</strong>
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {members.map((m) => {
              const badge = roleBadges[m.role] || roleBadges.MEMBER;
              return (
                <div key={m.id} className="py-3 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <p className="font-semibold text-xs text-white truncate">
                      {m.user.name || "Unnamed Member"}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{m.user.email}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    {m.role}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Subscription Upgrade Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">Upgrade Subscription Plan</h3>
                <p className="text-xs text-slate-400">
                  Select a commercial plan for <strong>{business.name}</strong> to scale your AI assistant limits and business features.
                </p>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                disabled={isPending}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* STARTER */}
              <div
                onClick={() => setSelectedPlanCode("STARTER")}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  selectedPlanCode === "STARTER"
                    ? "bg-slate-800/90 border-indigo-500 shadow-lg shadow-indigo-950/30"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Starter</span>
                    <span className="text-xs font-bold text-indigo-400">₦5,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    For small businesses.
                  </p>
                  <ul className="text-[11px] text-slate-300 space-y-1 pt-2 border-t border-slate-800">
                    <li>• 150 AI queries / month</li>
                    <li>• Industry Intelligence</li>
                    <li>• WhatsApp AI Bot</li>
                    <li>• Up to 5 staff</li>
                  </ul>
                </div>
              </div>

              {/* PRO (Recommended) */}
              <div
                onClick={() => setSelectedPlanCode("PRO")}
                className={`p-4 rounded-xl border relative cursor-pointer transition flex flex-col justify-between ${
                  selectedPlanCode === "PRO"
                    ? "bg-slate-800/90 border-emerald-500 shadow-lg shadow-emerald-950/30"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-emerald-500 text-slate-950 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Recommended
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Pro</span>
                    <span className="text-xs font-bold text-emerald-400">₦12,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    For growing SMEs.
                  </p>
                  <ul className="text-[11px] text-slate-300 space-y-1 pt-2 border-t border-slate-800">
                    <li>• 500 AI queries / month</li>
                    <li>• AI Write Actions (POS, Invoices)</li>
                    <li>• Advanced Business Brain</li>
                    <li>• Up to 10 staff</li>
                  </ul>
                </div>
              </div>

              {/* BUSINESS */}
              <div
                onClick={() => setSelectedPlanCode("BUSINESS")}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                  selectedPlanCode === "BUSINESS"
                    ? "bg-slate-800/90 border-amber-500 shadow-lg shadow-amber-950/30"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Business</span>
                    <span className="text-xs font-bold text-amber-400">₦25,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    For high-volume operations.
                  </p>
                  <ul className="text-[11px] text-slate-300 space-y-1 pt-2 border-t border-slate-800">
                    <li>• 1,500 AI queries / month</li>
                    <li>• Up to 25 staff members</li>
                    <li>• Priority AI execution</li>
                    <li>• Dedicated Support</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                🔒 Secured with Paystack payment gateway.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handlePlanCheckout(selectedPlanCode)}
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  {isPending ? "Processing..." : `Proceed to Paystack (${selectedPlanCode})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect / Verify WhatsApp Modal (2-Step Flow) */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {otpStep === "PHONE" ? "Link WhatsApp Number" : "Verify WhatsApp Code"}
              </h3>
              <button
                onClick={() => {
                  setIsLinkModalOpen(false);
                  setOtpStep("PHONE");
                }}
                disabled={isPending}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {otpStep === "PHONE" ? (
              <form onSubmit={handleRequestOtpSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    WhatsApp Phone Number:
                  </label>
                  <input
                    type="tel"
                    required
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    placeholder="e.g. +234 801 234 5678 or 08012345678"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                  <p className="text-[11px] text-slate-500">
                    A 6-digit security code will be sent to this WhatsApp number.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(false)}
                    disabled={isPending}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !inputPhone.trim()}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                  >
                    {isPending ? "Sending Code..." : "Send Verification Code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Enter 6-Digit Code:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>Sent to +{inputPhone}</span>
                    <button
                      type="button"
                      onClick={() => setOtpStep("PHONE")}
                      className="text-emerald-400 hover:underline"
                    >
                      Change Number
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLinkModalOpen(false);
                      setOtpStep("PHONE");
                    }}
                    disabled={isPending}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || inputOtp.length !== 6}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                  >
                    {isPending ? "Verifying..." : "Verify Number"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Disconnect WhatsApp Confirmation Modal */}
      {isDisconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Disconnect WhatsApp</h3>
              <button
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isPending}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to disconnect WhatsApp number{" "}
              <strong className="text-white font-mono">+{whatsAppConnection?.phoneNumber}</strong> from{" "}
              <strong>{business.name}</strong>? Incoming WhatsApp messages will no longer be processed for this business.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnectSubmit}
                disabled={isPending}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
              >
                {isPending ? "Disconnecting..." : "Yes, Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
