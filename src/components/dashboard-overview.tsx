"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { DailyActionPlan, BusinessOpportunity } from "@/lib/autopilot/types";
import QuickStartTutorialModal, { openQuickStartTutorial } from "./quick-start-tutorial-modal";

export interface DashboardOverviewProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  stats: {
    totalSales: number;
    salesToday: number;
    salesThisMonth: number;
    totalExpenses: number;
    netProfit: number;
    productCount: number;
    lowStockCount: number;
    customerCount: number;
    outstandingInvoicesCount: number;
    outstandingInvoicesAmount: number;
  };
  lowStockItems: {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }[];
  recentSales: {
    id: string;
    totalAmount: string;
    paymentMethod: string;
    status: string;
    createdAt: string;
    customerName: string | null;
    itemCount: number;
  }[];
  actionPlan?: DailyActionPlan;
  opportunities?: BusinessOpportunity[];
}

export default function DashboardOverview({
  business,
  stats,
  lowStockItems,
  recentSales,
  actionPlan,
  opportunities,
}: DashboardOverviewProps) {
  const currency = business.currency;

  // Dynamic time-based greeting
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 18
      ? "Good afternoon"
      : "Good evening";

  return (
    <div className="p-5 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* First-time login / on-demand Quick Start Tutorial Modal */}
      <QuickStartTutorialModal businessId={business.id} businessName={business.name} />

      {/* AI Command Center Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 tracking-wide uppercase">
              Command Center
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-beacon" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">Real-time Telemetry</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
            <span>{greeting},</span>
            <span className="gradient-text-ai">{business.name}</span>
            <span>👋</span>
          </h1>

          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => openQuickStartTutorial()}
            className="px-3 py-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-xl border border-violet-500/30 hover:border-violet-500/50 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Watch Quick Start Guide"
          >
            <span>💡</span>
            <span>Quick Start Guide</span>
          </button>

          <Link
            href="/sales"
            className="relative group px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2 border border-violet-300/30 overflow-hidden"
          >
            <span className="absolute inset-0 w-full h-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Record Sale</span>
          </Link>

          <Link
            href="/products"
            className="px-3.5 py-2.5 bg-white/80 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200/90 dark:border-white/[0.1] hover:border-violet-500/40 text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1.5 shadow-xs"
          >
            <span className="text-violet-600 dark:text-violet-400 font-bold">+</span>
            <span>Add Product</span>
          </Link>

          <Link
            href="/invoices"
            className="px-3.5 py-2.5 bg-white/80 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200/90 dark:border-white/[0.1] hover:border-cyan-500/40 text-xs font-semibold backdrop-blur-md transition-all flex items-center gap-1.5 shadow-xs"
          >
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">+</span>
            <span>New Invoice</span>
          </Link>
        </div>
      </div>

      {/* 🚀 BizPilot Autopilot: Daily Action Plan & Opportunities Centerpiece */}
      {actionPlan && (
        <div className="relative p-6 sm:p-7 bg-white/95 dark:bg-[#0b1028]/80 border border-violet-500/30 hover:border-violet-500/50 rounded-3xl space-y-6 shadow-xl dark:shadow-[0_0_40px_-10px_rgba(124,58,237,0.25)] backdrop-blur-xl overflow-hidden transition-all">
          {/* Atmospheric background glow inside Autopilot card */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Autopilot Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/[0.08] pb-5 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-md shadow-indigo-600/20 dark:shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                  <div className="w-full h-full bg-slate-900 dark:bg-[#090e24] rounded-[14px] flex items-center justify-center text-2xl">
                    🧠
                  </div>
                </div>
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-500 dark:bg-cyan-400 border-2 border-white dark:border-[#090e24] animate-beacon" />
              </div>

              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span>BIZPILOT AUTOPILOT</span>
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 tracking-wider">
                    LIVE
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                  {actionPlan.headline}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 px-3 py-1 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-xs">
                📅 {actionPlan.date}
              </span>
            </div>
          </div>

          {/* Action Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
            {/* Prioritized Action Items */}
            <div className="lg:col-span-2 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400" />
                  <span>Prioritized Action Items ({actionPlan.actions.length})</span>
                </h3>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Autonomous Business Diagnosis</span>
              </div>

              {actionPlan.actions.length === 0 ? (
                <div className="p-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-2xl text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                  <span className="text-xl">✅</span>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">All systems optimal today.</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">No urgent operational bottlenecks detected by the AI Autopilot engine.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {actionPlan.actions.map((item) => (
                    <div
                      key={item.priority}
                      className="p-4 bg-slate-50/90 dark:bg-white/[0.03] hover:bg-slate-100/90 dark:hover:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] hover:border-violet-500/40 rounded-2xl space-y-2 transition-all shadow-xs group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{item.badge}</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-cyan-200 transition-colors">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 px-2.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/30">
                          Priority #{item.priority}
                        </span>
                      </div>

                      <p className="text-xs text-slate-800 dark:text-cyan-200/90 font-medium pl-6 leading-relaxed">
                        ↳ <strong className="text-slate-900 dark:text-white">Recommended Action</strong>: {item.action}
                      </p>

                      {item.evidence && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-6 leading-relaxed">
                          ↳ <em className="text-slate-700 dark:text-slate-300 font-normal">Evidence</em>: {item.evidence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commercial Opportunities Column */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  <span>Commercial Opportunities</span>
                </h3>
              </div>

              {!opportunities || opportunities.length === 0 ? (
                <div className="p-5 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-2xl text-xs text-slate-500 dark:text-slate-400 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    <span>💡</span>
                    <span>AI Insight Engine</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Keep logging sales and customer activity to surface high-margin opportunities and customer repeat patterns.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {opportunities.slice(0, 2).map((opp) => (
                    <div
                      key={opp.id}
                      className="p-4 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-500/25 hover:border-emerald-500/40 rounded-2xl space-y-2 shadow-xs dark:shadow-[0_0_20px_-8px_rgba(16,185,129,0.2)] transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🚀</span>
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          {opp.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                        {opp.recommendedNextStep}
                      </p>
                      <p className="text-[10px] text-emerald-700 dark:text-emerald-400/80 font-mono">
                        {opp.evidence}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary KPI Stats Grid (4 Theme-Accented Glass Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales (Purple/Cyan Theme) */}
        <div className="p-5 bg-white/90 dark:bg-[#0b0f24]/70 border border-violet-500/25 hover:border-violet-500/45 rounded-2xl space-y-3 backdrop-blur-xl shadow-md dark:shadow-[0_0_25px_-8px_rgba(139,92,246,0.18)] transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Sales</span>
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-700 dark:text-violet-300 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatMoney(stats.totalSales, currency)}
            </p>
            <span className="text-[10px] text-cyan-600 dark:text-cyan-300 font-medium">Completed Transactions</span>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
            <span>Today: <strong className="text-slate-900 dark:text-white font-mono">{formatMoney(stats.salesToday, currency)}</strong></span>
            <span>Month: <strong className="text-slate-900 dark:text-white font-mono">{formatMoney(stats.salesThisMonth, currency)}</strong></span>
          </div>
        </div>

        {/* Card 2: Total Expenses & Net Profit (Magenta/Rose Theme) */}
        <div className="p-5 bg-white/90 dark:bg-[#0b0f24]/70 border border-rose-500/25 hover:border-rose-500/45 rounded-2xl space-y-3 backdrop-blur-xl shadow-md dark:shadow-[0_0_25px_-8px_rgba(244,63,94,0.18)] transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Expenses</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-700 dark:text-rose-300 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatMoney(stats.totalExpenses, currency)}
            </p>
            <span className="text-[10px] text-rose-600 dark:text-rose-300 font-medium">Logged Operating Outflows</span>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
            <span>Net Profit:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              stats.netProfit >= 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
            }`}>
              {formatMoney(stats.netProfit, currency)}
            </span>
          </div>
        </div>

        {/* Card 3: Inventory Status (Electric Blue Theme) */}
        <div className="p-5 bg-white/90 dark:bg-[#0b0f24]/70 border border-cyan-500/25 hover:border-cyan-500/45 rounded-2xl space-y-3 backdrop-blur-xl shadow-md dark:shadow-[0_0_25px_-8px_rgba(6,182,212,0.18)] transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Inventory Status</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-700 dark:text-cyan-300 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-baseline gap-1.5">
              <span>{stats.productCount}</span>
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Products</span>
            </p>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Catalog Active SKUs</span>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
            <span>Low Stock:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              stats.lowStockCount > 0
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 animate-pulse"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            }`}>
              {stats.lowStockCount} {stats.lowStockCount === 1 ? "Item" : "Items"}
            </span>
          </div>
        </div>

        {/* Card 4: Unpaid Invoices (Amber/Orange Theme) */}
        <div className="p-5 bg-white/90 dark:bg-[#0b0f24]/70 border border-amber-500/25 hover:border-amber-500/45 rounded-2xl space-y-3 backdrop-blur-xl shadow-md dark:shadow-[0_0_25px_-8px_rgba(245,158,11,0.18)] transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unpaid Invoices</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-300 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatMoney(stats.outstandingInvoicesAmount, currency)}
            </p>
            <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">Pending Receivables</span>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-2 border-t border-slate-200/80 dark:border-white/[0.06]">
            <span>Outstanding:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">
              {stats.outstandingInvoicesCount} {stats.outstandingInvoicesCount === 1 ? "Invoice" : "Invoices"}
            </span>
          </div>
        </div>
      </div>

      {/* Low Stock Urgent Items & Recent Sales Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inventory Intelligence Panel */}
        <div className="p-6 bg-white/90 dark:bg-[#090d22]/80 border border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] rounded-3xl space-y-4 backdrop-blur-xl shadow-md dark:shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${lowStockItems.length > 0 ? "bg-rose-500 animate-beacon" : "bg-cyan-500 dark:bg-cyan-400"}`} />
                <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Inventory Intelligence
                </h2>
              </div>
              <Link href="/products" className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold transition">
                Catalog →
              </Link>
            </div>

            {lowStockItems.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-cyan-500/10 dark:bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30 flex items-center justify-center text-2xl shadow-xs dark:shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                    📦
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 dark:bg-emerald-400 border-2 border-white dark:border-[#090d22] flex items-center justify-center text-[9px] text-white dark:text-black font-bold">
                    ✓
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Great! No low stock alerts</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">You&apos;re all stocked up.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 pt-3">
                {lowStockItems.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-rose-500/[0.06] border border-rose-500/25 hover:border-rose-500/40 rounded-xl flex items-center justify-between transition-all"
                  >
                    <div className="truncate pr-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">SKU: {p.sku}</p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-black text-[11px] border border-rose-500/30">
                        {p.stockQuantity} left
                      </span>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">Min: {p.lowStockThreshold}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.04]">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
              Automated reorder thresholds continuously evaluated
            </p>
          </div>
        </div>

        {/* Recent Sales Activity */}
        <div className="lg:col-span-2 p-6 bg-white/90 dark:bg-[#090d22]/80 border border-slate-200/90 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] rounded-3xl space-y-4 backdrop-blur-xl shadow-md dark:shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Recent Sales Activity
              </h2>
            </div>
            <Link href="/sales" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition">
              View All Sales →
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">No transactions recorded yet.</p>
              <Link
                href="/sales"
                className="inline-block px-3.5 py-1.5 bg-violet-600/15 dark:bg-violet-600/30 hover:bg-violet-600/25 dark:hover:bg-violet-600/50 text-violet-700 dark:text-violet-300 rounded-lg text-xs font-semibold border border-violet-500/30 transition"
              >
                Record First Sale →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Items</th>
                    <th className="pb-3">Method</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-slate-700 dark:text-slate-300">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {new Date(sale.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            {(sale.customerName || "W")[0].toUpperCase()}
                          </span>
                          <span className="truncate max-w-[120px]">
                            {sale.customerName || <span className="text-slate-500 dark:text-slate-400 font-normal">Walk-in</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-slate-500 dark:text-slate-400 font-mono">
                        {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.1]">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 text-right font-black text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                        {formatMoney(sale.totalAmount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
