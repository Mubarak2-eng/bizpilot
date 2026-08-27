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
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      label: "AI Assistant",
      href: "/assistant",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      label: "Sales & POS",
      href: "/sales",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Products",
      href: "/products",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Customers",
      href: "/customers",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: "Invoices",
      href: "/invoices",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: "Expenses",
      href: "/expenses",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      label: "Settings",
      href: "/settings",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const roleColors: Record<Role, { bg: string; text: string; border: string }> = {
    OWNER: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
    ADMIN: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
    STAFF: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    MEMBER: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
  };

  const currentRoleStyle = roleColors[role] || roleColors.STAFF;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
            BP
          </div>
          <div>
            <span className="font-bold text-sm text-white block truncate max-w-[150px]">
              {activeBusiness.name}
            </span>
            <span className={`text-[10px] font-semibold ${currentRoleStyle.text}`}>
              {role}
            </span>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Sidebar for Desktop & Mobile Overlay */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-600/30">
              BP
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-white block">BizPilot AI</span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Business OS</span>
            </div>
          </div>

          {/* Active Business Switcher */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Business</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${currentRoleStyle.bg} ${currentRoleStyle.text} ${currentRoleStyle.border}`}>
                {role}
              </span>
            </div>

            {memberships.length > 1 ? (
              <select
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                disabled={isPending}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none truncate"
              >
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-semibold text-white truncate">{activeBusiness.name}</p>
            )}

            <div className="text-[11px] text-slate-400 flex justify-between pt-0.5">
              <span>Currency:</span>
              <span className="font-semibold text-slate-200">{activeBusiness.currency}</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer & Sign Out */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
          <div className="truncate flex-1">
            <p className="text-xs font-semibold text-white truncate">{user.name || "User"}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign Out"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 transition cursor-pointer"
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
