"use client";

import { useState, useTransition, useId } from "react";
import {
  PlatformStats,
  PlatformUserItem,
  getPlatformUsersPaginated,
  togglePlatformAdminAction,
} from "@/lib/actions/admin";

interface AdminDashboardViewProps {
  initialStats: PlatformStats;
  initialUsers: PlatformUserItem[];
  initialPagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  currentUserEmail?: string | null;
}

// Helper formatting currency
function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Helper formatting relative or localized timestamp
function formatTime(isoString: string | null) {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Never";

  return date.toLocaleString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardView({
  initialStats,
  initialUsers,
  initialPagination,
  currentUserEmail,
}: AdminDashboardViewProps) {
  const searchInputId = useId();
  const [stats] = useState<PlatformStats>(initialStats);
  const [users, setUsers] = useState<PlatformUserItem[]>(initialUsers);
  const [pagination, setPagination] = useState(initialPagination);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "active_login">("all");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchUsers = (page: number, search: string, currentFilter: "all" | "admin" | "active_login") => {
    startTransition(async () => {
      try {
        setActionError(null);
        const result = await getPlatformUsersPaginated({
          page,
          limit: pagination.limit,
          search,
          filter: currentFilter,
        });
        setUsers(result.users);
        setPagination(result.pagination);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load users directory.";
        setActionError(errorMsg);
      }
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, searchTerm, filter);
  };

  const handleFilterChange = (newFilter: "all" | "admin" | "active_login") => {
    setFilter(newFilter);
    fetchUsers(1, searchTerm, newFilter);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    fetchUsers(newPage, searchTerm, filter);
  };

  const handleToggleAdmin = (targetUserId: string, targetEmail: string, currentIsAdmin: boolean) => {
    const actionName = currentIsAdmin ? "revoke admin access from" : "grant platform admin privileges to";
    if (!window.confirm(`Are you sure you want to ${actionName} ${targetEmail}?`)) {
      return;
    }

    startTransition(async () => {
      setActionError(null);
      setActionSuccess(null);
      const res = await togglePlatformAdminAction(targetUserId, !currentIsAdmin);
      if (res.success) {
        setActionSuccess(`Successfully updated role for ${targetEmail}.`);
        fetchUsers(pagination.page, searchTerm, filter);
      } else {
        setActionError(res.error || "Action failed.");
      }
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-900/40 via-indigo-900/30 to-cyan-900/20 border border-violet-500/20 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Platform Owner Console
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">
                Secure Cross-Tenant Monitor
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              BizPilot AI System Administration
            </h1>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl">
              Cross-organization telemetry, tenant registrations, authentication audits, and commercial tier metrics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchUsers(pagination.page, searchTerm, filter)}
              disabled={isPending}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 active:scale-95 border border-white/10 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <svg className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Users</span>
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-500 dark:text-violet-400 flex items-center justify-center font-bold">
              👥
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.totalUsers.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
              +{stats.newUsersLast7Days} 7d
            </span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
              +{stats.newUsersLast30Days} 30d
            </span>
          </div>
        </div>

        {/* Total Businesses */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workspaces</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 flex items-center justify-center font-bold">
              🏢
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.totalBusinesses.toLocaleString()}</span>
            <span className="text-xs text-slate-500">Tenants</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {stats.activityTotals.totalProductsCount.toLocaleString()} products cataloged
          </div>
        </div>

        {/* Subscriptions Tier Breakdown */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subscription Tiers</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center font-bold">
              💳
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Free</span>
              <span className="font-bold text-slate-900 dark:text-white">{stats.planBreakdown.free}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
              <span className="text-[10px] text-blue-400 uppercase block font-semibold">Starter</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{stats.planBreakdown.starter}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
              <span className="text-[10px] text-violet-400 uppercase block font-semibold">Pro</span>
              <span className="font-bold text-violet-600 dark:text-violet-400">{stats.planBreakdown.pro}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/[0.05]">
              <span className="text-[10px] text-amber-400 uppercase block font-semibold">Business</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{stats.planBreakdown.business}</span>
            </div>
          </div>
        </div>

        {/* Platform Transaction Totals */}
        <div className="p-5 rounded-2xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tenant Activity</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center font-bold">
              📈
            </div>
          </div>
          <div>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 block truncate">
              {formatCurrency(stats.activityTotals.totalSalesVolume)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {stats.activityTotals.totalSalesCount.toLocaleString()} completed sales
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-white/[0.05] flex justify-between">
            <span>Invoices: {stats.activityTotals.totalInvoicesCount}</span>
            <span>Expenses: {stats.activityTotals.totalExpensesCount}</span>
          </div>
        </div>
      </div>

      {/* Real-time Feeds: Recent Logins & Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Successful Logins */}
        <div className="p-6 rounded-3xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Recent Authentications
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verified logins with 2FA OTP & device telemetry (IPs hashed)
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {stats.recentSuccessfulLogins.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No login events recorded yet.</p>
            ) : (
              stats.recentSuccessfulLogins.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                      ✓
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-slate-800 dark:text-white truncate">
                        {item.userName || item.userEmail}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {item.userAgentLabel || "Browser"} • {item.ipHash || "ip_masked"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400 shrink-0">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Registrations */}
        <div className="p-6 rounded-3xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                Latest Registrations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Newly onboarded accounts across all tenants
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {stats.recentRegistrations.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No registrations yet.</p>
            ) : (
              stats.recentRegistrations.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-7 h-7 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                      👤
                    </div>
                    <div className="truncate">
                      <p className="font-semibold text-slate-800 dark:text-white truncate">
                        {item.name || "New User"}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">
                        {item.email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-medium text-slate-400">
                      Joined {formatTime(item.createdAt)}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      Last: {formatTime(item.lastLoginAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Searchable Users Directory Table */}
      <div className="p-6 md:p-8 rounded-3xl bg-white/80 dark:bg-[#090e24]/80 border border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              User & Tenant Directory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search by user name, email, or business workspace name.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleFilterChange("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filter === "all"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:text-white"
              }`}
            >
              All Users ({pagination.totalCount})
            </button>
            <button
              onClick={() => handleFilterChange("admin")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filter === "admin"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:text-white"
              }`}
            >
              Platform Admins
            </button>
            <button
              onClick={() => handleFilterChange("active_login")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filter === "active_login"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:text-white"
              }`}
            >
              Active Logins
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              id={searchInputId}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, or business name..."
              aria-label="Search users by name, email, or business name"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition shadow-xs"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  fetchUsers(1, "", filter);
                }}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
          >
            Search
          </button>
        </form>

        {/* Directory Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-white/[0.08]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200/80 dark:border-white/[0.08] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-4">User</th>
                <th className="p-4">Business / Organization</th>
                <th className="p-4">Role & Plan</th>
                <th className="p-4">Last Login</th>
                <th className="p-4">Registered</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.04]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                    No users matching the query.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = u.email === currentUserEmail;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition">
                      {/* User details */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shrink-0">
                            {(u.name || u.email || "U").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-white block">
                                {u.name || "Unnamed"}
                              </span>
                              {u.isPlatformAdmin && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block">
                              {u.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Businesses */}
                      <td className="p-4">
                        {u.businesses.length === 0 ? (
                          <span className="text-slate-400 italic">No workspace</span>
                        ) : (
                          <div className="space-y-1">
                            {u.businesses.map((b) => (
                              <div key={b.id} className="text-slate-800 dark:text-slate-200 font-medium">
                                {b.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Role & Plan */}
                      <td className="p-4">
                        {u.businesses.length === 0 ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="space-y-1">
                            {u.businesses.map((b) => (
                              <div key={b.id} className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/[0.1]">
                                  {b.role}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30">
                                  {b.planCode}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="p-4 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {formatTime(u.lastLoginAt)}
                      </td>

                      {/* Registered */}
                      <td className="p-4 text-slate-500 dark:text-slate-400 text-[11px]">
                        {formatTime(u.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {!isCurrent && (
                          <button
                            onClick={() => handleToggleAdmin(u.id, u.email, u.isPlatformAdmin)}
                            disabled={isPending}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                              u.isPlatformAdmin
                                ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : "bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30"
                            }`}
                          >
                            {u.isPlatformAdmin ? "Revoke Admin" : "Make Admin"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-white/[0.08] text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || isPending}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed transition font-medium cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isPending}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-white disabled:opacity-40 disabled:cursor-not-allowed transition font-medium cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
