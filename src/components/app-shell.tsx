"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { BusinessSummary, Role } from "@/types/auth";
import { switchActiveBusinessAction } from "@/lib/actions/business";

interface AppShellProps {
  children: React.ReactNode;
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

export default function AppShell({
  children,
  user,
  activeBusiness,
  role,
  memberships,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSwitchBusiness = (businessId: string) => {
    startTransition(async () => {
      const res = await switchActiveBusinessAction(businessId);
      if (res.success) {
        router.refresh();
      }
    });
  };

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "AI Assistant",
      href: "/assistant",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      badge: "AI",
    },
    {
      label: "Sales & POS",
      href: "/sales",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "Products",
      href: "/products",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "Customers",
      href: "/customers",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "Invoices",
      href: "/invoices",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "Expenses",
      href: "/expenses",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      badge: null,
    },
    {
      label: "Settings",
      href: "/settings",
      icon: (
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      badge: null,
    },
  ];

  const roleStyles: Record<Role, { bg: string; text: string; border: string; glow: string }> = {
    OWNER: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      glow: "shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)]",
    },
    ADMIN: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/30",
      glow: "shadow-[0_0_12px_-2px_rgba(245,158,11,0.3)]",
    },
    STAFF: {
      bg: "bg-blue-500/10",
      text: "text-blue-400",
      border: "border-blue-500/30",
      glow: "shadow-[0_0_12px_-2px_rgba(59,130,246,0.3)]",
    },
    MEMBER: {
      bg: "bg-slate-500/10",
      text: "text-slate-400",
      border: "border-slate-500/30",
      glow: "shadow-none",
    },
  };

  const currentRoleStyle = roleStyles[role] || roleStyles.STAFF;
  const userInitials = (user.name || user.email || "BP")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-mesh-dark text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Mobile Top Navigation Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#080c1d]/90 border-b border-white/[0.08] backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 p-0.5 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            <div className="w-full h-full bg-[#070914] rounded-[6px] flex items-center justify-center font-black text-white text-xs tracking-tighter">
              BP
            </div>
          </div>
          <div>
            <span className="font-bold text-xs text-white block truncate max-w-[140px]">
              {activeBusiness.name}
            </span>
            <span className={`text-[10px] font-semibold tracking-wider ${currentRoleStyle.text}`}>
              {role}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-beacon" />
            <span>Live</span>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white transition"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Futuristic Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#080d21]/90 md:bg-[#070b1e]/75 border-r border-white/[0.08] backdrop-blur-2xl flex flex-col justify-between transition-all duration-300 ease-out md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0 shadow-2xl shadow-indigo-950/80" : "-translate-x-full"
        }`}
      >
        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          {/* Logo & Platform Name */}
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-[0_0_20px_rgba(99,102,241,0.35)] group-hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] transition-all">
                <div className="w-full h-full bg-[#080c1d] rounded-[10px] flex items-center justify-center font-black text-white text-base tracking-tighter">
                  BP
                </div>
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-[#080c1d] animate-beacon" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-white block">BizPilot AI</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  OS
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase block">
                Business Intelligence
              </span>
            </div>
          </Link>

          {/* Active Business Switcher Panel */}
          <div className="p-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-2 backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Workspace</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentRoleStyle.bg} ${currentRoleStyle.text} ${currentRoleStyle.border} ${currentRoleStyle.glow}`}>
                {role}
              </span>
            </div>

            {memberships.length > 1 ? (
              <select
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                disabled={isPending}
                className="w-full px-2.5 py-1.5 bg-[#0a0f26] border border-white/[0.12] rounded-lg text-white text-xs font-medium focus:ring-2 focus:ring-violet-500 focus:outline-none truncate transition cursor-pointer"
              >
                {memberships.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#0b1028] text-white">
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                {activeBusiness.name}
              </p>
            )}

            <div className="text-[11px] text-slate-400 flex justify-between items-center pt-0.5 border-t border-white/[0.04]">
              <span className="text-slate-400 text-[10px]">Currency:</span>
              <span className="font-mono text-xs font-semibold text-cyan-300">{activeBusiness.currency}</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <div className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Navigation
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                    isActive
                      ? "bg-gradient-to-r from-violet-600/90 to-indigo-600/90 text-white font-semibold shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-violet-400/30"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? "text-cyan-200" : "text-slate-400 group-hover:text-indigo-400"}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className="px-1.5 py-0.2 text-[9px] font-black rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                  {isActive && !item.badge && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer & Sign Out Capsule */}
        <div className="p-3.5 m-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 truncate flex-1">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/20 shrink-0">
              {userInitials}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate leading-snug">{user.name || "User"}</p>
              <p className="text-[10px] text-slate-400 truncate font-mono">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign Out"
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.06] hover:border-rose-500/30 transition cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Main Content Area + Top Command Bar */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050711] overflow-hidden">
        {/* Desktop Futuristic Top Command Bar */}
        <div className="hidden md:flex items-center justify-between px-8 py-3.5 bg-[#070b1e]/60 border-b border-white/[0.06] backdrop-blur-xl sticky top-0 z-20">
          {/* Command Center Search Bar */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              readOnly
              onClick={() => router.push("/assistant")}
              placeholder="Search anything with AI... (Ask 'sales today', 'low stock', etc.)"
              className="w-full pl-10 pr-12 py-1.5 bg-[#0a0f26]/80 border border-white/[0.08] hover:border-white/[0.15] rounded-xl text-xs text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition cursor-pointer"
            />
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-white/[0.06] border border-white/[0.1] rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Right Status Indicators & Profile Pill */}
          <div className="flex items-center gap-3">
            {/* Live Autopilot Status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs font-medium text-violet-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-beacon" />
              <span className="text-[11px] font-semibold">BizPilot Autopilot Active</span>
            </div>

            {/* Quick Action Assistant Link */}
            <Link
              href="/assistant"
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 border border-violet-400/30 transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Ask AI</span>
            </Link>
          </div>
        </div>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto bg-mesh-dark">
          {children}
        </main>
      </div>
    </div>
  );
}
