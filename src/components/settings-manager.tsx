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
    OWNER: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
    ADMIN: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30" },
    STAFF: { bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/30" },
    MEMBER: { bg: "bg-slate-500/15", text: "text-slate-700 dark:text-slate-400", border: "border-slate-500/30" },
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
    <div className="p-5 md:p-8 space-y-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="pb-1">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 uppercase tracking-wide">
            Enterprise Configuration
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Workspace Controls</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
          Business Profile & Settings
        </h1>
        <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
          Manage workspace settings, subscription plans, WhatsApp AI bot integration, and role permissions
        </p>
      </div>

      {/* Feedback Alerts */}
      {feedback?.message && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs md:text-sm flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <span>✅</span>
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {feedback?.error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs md:text-sm flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 font-medium">
            <span>⚠️</span>
            <span>{feedback.error}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Subscription & AI Quotas Card (Futuristic Tier Banner) */}
      <div className="relative p-6 sm:p-7 bg-white/90 dark:bg-[#090d24]/90 border border-slate-200/90 dark:border-violet-500/30 rounded-3xl space-y-6 shadow-md dark:shadow-[0_0_35px_-8px_rgba(139,92,246,0.25)] backdrop-blur-xl overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-cyan-500 p-[1.5px] shadow-sm">
              <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[14px] flex items-center justify-center text-cyan-300 text-xl font-bold">
                ⚡
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {subscription?.planName || "BizPilot OS"}
                </h2>
                {subscription?.isTrialing ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    14-DAY PRO TRIAL
                  </span>
                ) : subscription?.status === "ACTIVE" ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    ACTIVE TIER
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/[0.1]">
                    FREE TIER
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                {subscription?.monthlyPrice && subscription.monthlyPrice > 0
                  ? `₦${subscription.monthlyPrice.toLocaleString()}/month`
                  : "Free Plan"}
              </p>
            </div>
          </div>

          {canManage && (
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white transition flex items-center gap-2 shadow-md shadow-indigo-600/25 dark:shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-violet-300/30 cursor-pointer self-start sm:self-auto"
            >
              <span>{subscription?.planCode === "BUSINESS" ? "Manage Plan" : "Upgrade Subscription"}</span>
              <span>→</span>
            </button>
          )}
        </div>

        {/* AI Usage Progress Meter */}
        {aiUsage && (
          <div className="p-4.5 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-2xl space-y-3 relative z-10 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-800 dark:text-slate-300 font-bold flex items-center gap-2">
                <span className="text-sm">🤖</span> AI Copilot Monthly Quota:
              </span>
              <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300 text-xs">
                {aiUsage.queryCount} / {aiUsage.limit} queries
              </span>
            </div>

            {/* Visual Bar */}
            <div className="w-full h-2.5 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  usagePercent >= 90
                    ? "bg-rose-500 shadow-sm"
                    : usagePercent >= 70
                    ? "bg-amber-500 shadow-sm"
                    : "bg-gradient-to-r from-violet-500 via-indigo-500 to-cyan-400 shadow-sm"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-mono">{aiUsage.remaining} queries remaining this cycle</span>
              {subscription?.currentPeriodEnd && (
                <span>
                  Resets on:{" "}
                  <strong className="text-slate-800 dark:text-slate-200 font-mono">
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
        <div className="md:col-span-1 p-6 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl space-y-4 backdrop-blur-xl shadow-md">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Business Identity</h2>
          </div>

          <div className="space-y-3 text-xs">
            <div className="py-1.5 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Organization Name</span>
              <span className="text-slate-900 dark:text-white font-bold text-sm mt-0.5 block">{business.name}</span>
            </div>
            <div className="py-1.5 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Unique Slug</span>
              <code className="text-cyan-700 dark:text-cyan-300 font-mono text-xs mt-0.5 block">{business.slug}</code>
            </div>
            <div className="py-1.5 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Industry Type</span>
              <span className="text-amber-700 dark:text-amber-300 font-bold text-xs tracking-wide mt-0.5 block">
                {business.businessType || "OTHER"}
              </span>
            </div>
            <div className="py-1.5 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Primary Currency</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold text-sm font-mono mt-0.5 block">{business.currency}</span>
            </div>
            <div className="py-1.5 border-b border-slate-100 dark:border-white/[0.04]">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Tenant ID</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono text-[10px] break-all block mt-0.5">{business.id}</span>
            </div>
            <div className="py-1.5">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase">Created On</span>
              <span className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5 block">
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
        <div className="md:col-span-2 p-6 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl space-y-5 backdrop-blur-xl shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-base">
                💬
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  WhatsApp AI Integration
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Connect your business WhatsApp for natural language sales and reporting
                </p>
              </div>
            </div>

            {whatsAppConnection && whatsAppConnection.verified ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-beacon" />
                VERIFIED
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.08]">
                NOT CONNECTED
              </span>
            )}
          </div>

          {whatsAppConnection && whatsAppConnection.verified ? (
            <div className="p-4.5 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-bold">
                    Connected Number
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-black text-slate-900 dark:text-white tracking-wide">
                      +{whatsAppConnection.phoneNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
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
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200 transition border border-slate-200 dark:border-white/[0.08] disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      Change Number
                    </button>
                    <button
                      onClick={() => setIsDisconnectModalOpen(true)}
                      disabled={isPending}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 transition border border-rose-200 dark:border-rose-500/25 disabled:opacity-50 cursor-pointer shadow-xs"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 uppercase">Connected By:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">
                    {whatsAppConnection.linkedByUser?.name || whatsAppConnection.linkedByUser?.email || "Admin"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 uppercase">Linked Since:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-mono">
                    {new Date(whatsAppConnection.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
                💡 <strong>Bot Ready:</strong> Send messages like <em>&quot;What were my sales today?&quot;</em> or <em>&quot;Record cash sale 3 Power Banks&quot;</em> from this WhatsApp number to interact with your AI business assistant.
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-2xl space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  No WhatsApp Number Connected
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Link your WhatsApp phone number to enable instant natural-language sales recording, expense logging, stock lookups, and invoice generation directly from chat.
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
                  className="px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition flex items-center gap-2 shadow-md shadow-emerald-600/25 cursor-pointer"
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
        <div className="md:col-span-3 p-6 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl space-y-4 backdrop-blur-xl shadow-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Team Members ({members.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Your Role: <strong className={roleBadges[currentUserRole]?.text}>{currentUserRole}</strong>
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {members.map((m) => {
              const badge = roleBadges[m.role] || roleBadges.MEMBER;
              const initials = (m.user.name || m.user.email || "U")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div key={m.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate pr-2">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] flex items-center justify-center font-bold text-slate-900 dark:text-white text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {m.user.name || "Unnamed Member"}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">{m.user.email}</p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-violet-500/30 w-full max-w-3xl rounded-3xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Upgrade Subscription Plan</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select a commercial plan for <strong>{business.name}</strong> to scale your AI assistant limits and business features.
                </p>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                disabled={isPending}
                aria-label="Close modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* STARTER */}
              <div
                onClick={() => setSelectedPlanCode("STARTER")}
                className={`p-4.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  selectedPlanCode === "STARTER"
                    ? "bg-violet-50 dark:bg-[#0b1236] border-violet-500 shadow-md shadow-violet-500/20"
                    : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15]"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Starter</span>
                    <span className="text-xs font-bold text-violet-700 dark:text-violet-300 font-mono">₦5,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    For small businesses.
                  </p>
                  <ul className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
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
                className={`p-4.5 rounded-2xl border relative cursor-pointer transition-all flex flex-col justify-between ${
                  selectedPlanCode === "PRO"
                    ? "bg-cyan-50 dark:bg-[#0b1236] border-cyan-500 shadow-md shadow-cyan-500/20"
                    : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15]"
                }`}
              >
                <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-cyan-500 text-white dark:text-slate-950 text-[9px] font-black rounded-full uppercase tracking-wider">
                  Recommended
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Pro</span>
                    <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300 font-mono">₦5,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    For growing businesses.
                  </p>
                  <ul className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
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
                className={`p-4.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                  selectedPlanCode === "BUSINESS"
                    ? "bg-amber-50 dark:bg-[#0b1236] border-amber-500 shadow-md shadow-amber-500/20"
                    : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15]"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Business</span>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 font-mono">₦25,000/mo</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    For high-volume operations.
                  </p>
                  <ul className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                    <li>• 1,500 AI queries / month</li>
                    <li>• Up to 25 staff members</li>
                    <li>• Priority AI execution</li>
                    <li>• Dedicated Support</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.08]">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                🔒 Secured with Paystack payment gateway.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handlePlanCheckout(selectedPlanCode)}
                  disabled={isPending}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/25"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-emerald-500/30 w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {otpStep === "PHONE" ? "Link WhatsApp Number" : "Verify WhatsApp Code"}
              </h3>
              <button
                onClick={() => {
                  setIsLinkModalOpen(false);
                  setOtpStep("PHONE");
                }}
                disabled={isPending}
                aria-label="Close modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {otpStep === "PHONE" ? (
              <form onSubmit={handleRequestOtpSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="whatsapp-phone-input" className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    WhatsApp Phone Number:
                  </label>
                  <input
                    id="whatsapp-phone-input"
                    type="tel"
                    required
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    placeholder="e.g. +234 801 234 5678 or 08012345678"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-emerald-500 rounded-xl text-slate-900 dark:text-white text-xs font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition shadow-xs"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    A 6-digit security code will be sent to this WhatsApp number.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(false)}
                    disabled={isPending}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !inputPhone.trim()}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/25"
                  >
                    {isPending ? "Sending Code..." : "Send Verification Code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="whatsapp-otp-input" className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                    Enter 6-Digit Code:
                  </label>
                  <input
                    id="whatsapp-otp-input"
                    type="text"
                    required
                    maxLength={6}
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-emerald-500 rounded-xl text-slate-900 dark:text-white text-center text-lg font-mono tracking-widest placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition shadow-xs"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    <span className="font-mono">Sent to +{inputPhone}</span>
                    <button
                      type="button"
                      onClick={() => setOtpStep("PHONE")}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
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
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || inputOtp.length !== 6}
                    className="px-4 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/25"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-rose-500/30 w-full max-w-md rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Disconnect WhatsApp</h3>
              <button
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isPending}
                aria-label="Close modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Are you sure you want to disconnect WhatsApp number{" "}
              <strong className="text-slate-900 dark:text-white font-mono">+{whatsAppConnection?.phoneNumber}</strong> from{" "}
              <strong>{business.name}</strong>? Incoming WhatsApp messages will no longer be processed for this business.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnectSubmit}
                disabled={isPending}
                className="px-4 py-2.5 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md shadow-rose-600/25"
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
