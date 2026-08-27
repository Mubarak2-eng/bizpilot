"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { BusinessSummary, Role } from "@/types/auth";
import { performAdminAction, performOwnerAction, switchActiveBusinessAction } from "@/lib/actions/business";

interface DashboardClientProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  activeBusiness: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  role: Role;
  memberships: BusinessSummary[];
}

export default function DashboardClient({
  user,
  activeBusiness,
  role,
  memberships,
}: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const handleSwitchBusiness = (businessId: string) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await switchActiveBusinessAction(businessId);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        router.refresh();
      }
    });
  };

  const handleTestAdmin = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await performAdminAction(activeBusiness.id, "Update Product Catalog Settings");
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
      }
    });
  };

  const handleTestOwner = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await performOwnerAction(activeBusiness.id, "Modify Business Ownership & Billing Settings");
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
      }
    });
  };

  const roleColors: Record<Role, { bg: string; text: string; border: string }> = {
    OWNER: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    ADMIN: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    STAFF: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    MEMBER: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
  };

  const currentRoleStyle = roleColors[role] || roleColors.STAFF;

  return (
    <div className="space-y-6">
      {/* Top Bar Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
            BP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{activeBusiness.name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentRoleStyle.bg} ${currentRoleStyle.text} ${currentRoleStyle.border}`}>
                {role}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Slug: <code className="text-slate-300">{activeBusiness.slug}</code> | Currency: <span className="text-slate-300 font-medium">{activeBusiness.currency}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Multi-Tenant Business Switcher */}
          {memberships.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-medium">Switch Business:</label>
              <select
                id="business-switcher"
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                disabled={isPending}
                className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white">{user.name || "User"}</p>
            <p className="text-[11px] text-slate-400">{user.email}</p>
          </div>

          <button
            id="signout-btn"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-xs font-medium transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm transition-all ${
            feedback.error
              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          }`}
        >
          {feedback.error || feedback.message}
        </div>
      )}

      {/* Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Session & Multi-Tenancy Card */}
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Tenant Context</h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Authenticated User:</span>
              <span className="text-white font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Email:</span>
              <span className="text-white font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Active Tenant ID:</span>
              <span className="text-slate-300 font-mono text-[11px] truncate max-w-[150px]">{activeBusiness.id}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">Tenant Memberships:</span>
              <span className="text-indigo-400 font-medium">{memberships.length} Business{memberships.length > 1 ? "es" : ""}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-400">Your Role in Tenant:</span>
              <span className={`font-semibold ${currentRoleStyle.text}`}>{role}</span>
            </div>
          </div>
        </div>

        {/* Multi-Tenant Security & Isolation Details */}
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Security Architecture</h2>
          <ul className="text-xs text-slate-300 space-y-2.5 list-disc pl-4">
            <li><strong>Server-Side Enforced:</strong> Client-supplied tenant IDs are never trusted directly.</li>
            <li><strong>Role Hierarchy:</strong> OWNER &gt; ADMIN &gt; STAFF enforced in data access layer.</li>
            <li><strong>Zero Cross-Tenant Leakage:</strong> Queries verify membership in DB per request.</li>
            <li><strong>Encrypted Passwords:</strong> bcrypt 10-round hashing with zero plaintext storage.</li>
          </ul>
        </div>

        {/* Interactive Authorization Tester */}
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Role Action Verifier</h2>
          <p className="text-xs text-slate-400">
            Test server-side authorization enforcement for your current role (<span className={`font-bold ${currentRoleStyle.text}`}>{role}</span>):
          </p>

          <div className="space-y-2.5">
            <button
              id="test-admin-action-btn"
              onClick={handleTestAdmin}
              disabled={isPending}
              className="w-full py-2.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 text-left flex justify-between items-center"
            >
              <span>Test Admin Action</span>
              <span className="text-[10px] text-amber-400/70">Requires ADMIN/OWNER</span>
            </button>

            <button
              id="test-owner-action-btn"
              onClick={handleTestOwner}
              disabled={isPending}
              className="w-full py-2.5 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 text-left flex justify-between items-center"
            >
              <span>Test Owner Action</span>
              <span className="text-[10px] text-emerald-400/70">Requires OWNER only</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
