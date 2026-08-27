import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex flex-col justify-between">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-indigo-400">
            BP
          </div>
          <span className="font-bold text-lg tracking-tight text-white">BizPilot AI</span>
        </div>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              Go to Dashboard ({session.user.name || "User"})
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 py-20 text-center space-y-8 flex-1 flex flex-col justify-center items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
          Multi-Tenant AI Business Platform • Phase 2 Ready
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Intelligent Operations for Modern Businesses
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-2xl">
          Multi-tenant inventory, sales, invoicing, and autonomous AI assistance designed for growing African & global enterprises.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
          <Link
            href={session?.user ? "/dashboard" : "/login"}
            className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl shadow-xl shadow-indigo-600/30 transition cursor-pointer"
          >
            {session?.user ? "Enter Dashboard" : "Sign In with Demo Credentials"}
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto px-6 py-3.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-sm rounded-xl border border-slate-700 transition cursor-pointer"
          >
            Create New Business
          </Link>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left w-full">
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <h2 className="text-sm font-semibold text-white mb-1">Multi-Tenant Isolation</h2>
            <p className="text-xs text-slate-400">Strict per-tenant data scoping and role-based permissions (OWNER, ADMIN, STAFF).</p>
          </div>
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <h2 className="text-sm font-semibold text-white mb-1">Secure Auth & Sessions</h2>
            <p className="text-xs text-slate-400">bcrypt password encryption, Auth.js JWT sessions, and zero plaintext credentials.</p>
          </div>
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <h2 className="text-sm font-semibold text-white mb-1">PostgreSQL & Prisma</h2>
            <p className="text-xs text-slate-400">Decimal currency precision (NGN/USD/etc.) and relational database guarantees.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-slate-800/60 text-center text-xs text-slate-500">
        © 2026 BizPilot AI. Production-ready multi-tenant business suite.
      </footer>
    </div>
  );
}
