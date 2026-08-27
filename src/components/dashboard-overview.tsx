"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { DailyActionPlan, BusinessOpportunity } from "@/lib/autopilot/types";

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

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            {business.name}
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Real-time business performance & Autopilot manager
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/sales"
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Record Sale
          </Link>
          <Link
            href="/products"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold transition"
          >
            + Add Product
          </Link>
          <Link
            href="/invoices"
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold transition"
          >
            + New Invoice
          </Link>
        </div>
      </div>

      {/* 🚀 BizPilot Autopilot: Daily Action Plan & Opportunities Card */}
      {actionPlan && (
        <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl">
                🧠
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                  <span>BizPilot Autopilot: Today&apos;s Strategic Action Plan</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    LIVE
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {actionPlan.headline}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {actionPlan.date}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Action Items List */}
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Prioritized Action Items ({actionPlan.actions.length})
              </h3>
              {actionPlan.actions.length === 0 ? (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
                  ✅ Your business is operating normally today. No urgent action is required.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {actionPlan.actions.map((item) => (
                    <div
                      key={item.priority}
                      className="p-3.5 bg-slate-950/80 border border-slate-800/90 rounded-xl space-y-1.5 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{item.badge}</span>
                          <span className="text-xs font-bold text-white">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 rounded bg-slate-800">
                          Priority #{item.priority}
                        </span>
                      </div>
                      <p className="text-xs text-indigo-300/90 font-medium pl-6">
                        ↳ <strong>Recommended Action</strong>: {item.action}
                      </p>
                      {item.evidence && (
                        <p className="text-[11px] text-slate-400 pl-6">
                          ↳ <em>Evidence</em>: {item.evidence}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Opportunities Column */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Commercial Opportunities
              </h3>
              {!opportunities || opportunities.length === 0 ? (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400">
                  💡 Keep logging sales and customer activity to surface new growth opportunities.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {opportunities.slice(0, 2).map((opp) => (
                    <div
                      key={opp.id}
                      className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span>🚀</span>
                        <span className="text-xs font-bold text-emerald-300">
                          {opp.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {opp.recommendedNextStep}
                      </p>
                      <p className="text-[10px] text-slate-400">
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

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Sales (Completed)</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">
            {formatMoney(stats.totalSales, currency)}
          </p>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Today: <strong className="text-slate-200">{formatMoney(stats.salesToday, currency)}</strong></span>
            <span>This Month: <strong className="text-slate-200">{formatMoney(stats.salesThisMonth, currency)}</strong></span>
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Expenses</span>
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">
            {formatMoney(stats.totalExpenses, currency)}
          </p>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Est. Net Profit:</span>
            <strong className={`font-semibold ${stats.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatMoney(stats.netProfit, currency)}
            </strong>
          </div>
        </div>

        {/* Inventory Items */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Inventory Status</span>
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">
            {stats.productCount} <span className="text-xs font-normal text-slate-400">Products</span>
          </p>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Low Stock Alerts:</span>
            <strong className={stats.lowStockCount > 0 ? "text-amber-400" : "text-emerald-400"}>
              {stats.lowStockCount} item{stats.lowStockCount !== 1 ? "s" : ""}
            </strong>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Unpaid Invoices</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
          </div>
          <p className="text-xl font-bold text-white tracking-tight">
            {formatMoney(stats.outstandingInvoicesAmount, currency)}
          </p>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Pending Payment:</span>
            <strong className="text-slate-200">{stats.outstandingInvoicesCount} invoice{stats.outstandingInvoicesCount !== 1 ? "s" : ""}</strong>
          </div>
        </div>
      </div>

      {/* Low Stock Urgent Items & Recent Sales Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              Low Stock Warnings
            </h2>
            <Link href="/products" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              Catalog →
            </Link>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              ✅ All products are adequately stocked above their thresholds.
            </div>
          ) : (
            <div className="space-y-2.5">
              {lowStockItems.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-slate-950 border border-rose-500/20 rounded-xl flex items-center justify-between"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-400">SKU: {p.sku}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-xs">
                      {p.stockQuantity} left
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Threshold: {p.lowStockThreshold}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sales Activity */}
        <div className="lg:col-span-2 p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Recent Sales Activity
            </h2>
            <Link href="/sales" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              View All Sales →
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No sales recorded yet. Click &quot;Record Sale&quot; to create your first transaction.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2.5">Date</th>
                    <th className="pb-2.5">Customer</th>
                    <th className="pb-2.5">Items</th>
                    <th className="pb-2.5">Payment</th>
                    <th className="pb-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-800/30">
                      <td className="py-3 text-slate-400">
                        {new Date(sale.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 font-medium text-white">
                        {sale.customerName || <span className="text-slate-500">Walk-in</span>}
                      </td>
                      <td className="py-3 text-slate-400">
                        {sale.itemCount} item{sale.itemCount !== 1 ? "s" : ""}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-emerald-400">
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
