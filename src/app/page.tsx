import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-mesh-dark text-white flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200 antialiased relative overflow-hidden">
      {/* Background glow flares */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-tr from-violet-600/20 via-indigo-600/25 to-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full border-b border-white/[0.08] relative z-10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <div className="w-full h-full bg-[#080c1d] rounded-[10px] flex items-center justify-center font-black text-white text-base tracking-tight">
              BP
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg tracking-tight text-white">BizPilot AI</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                OS
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer border border-violet-300/30"
            >
              Go to Dashboard ({session.user.name || "User"})
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] transition cursor-pointer border border-violet-300/30"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 py-20 text-center space-y-8 flex-1 flex flex-col justify-center items-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-semibold backdrop-blur-md shadow-[0_0_20px_-5px_rgba(139,92,246,0.3)]">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-beacon" />
          Autonomous AI Business Operating System • 2026 Production Ready
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[1.1]">
          Intelligent Operations for <br />
          <span className="gradient-text-ai">Modern Enterprises</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
          Multi-tenant inventory intelligence, POS terminal, WhatsApp automation, and autonomous AI copilot engineered for growing African & global businesses.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
          <Link
            href={session?.user ? "/dashboard" : "/login"}
            className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm rounded-xl shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all cursor-pointer border border-violet-300/30"
          >
            {session?.user ? "Enter AI Command Center" : "Sign In with Demo Credentials"}
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto px-7 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white font-semibold text-sm rounded-xl border border-white/[0.1] hover:border-violet-500/40 backdrop-blur-xl transition cursor-pointer"
          >
            Create New Business
          </Link>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-12 text-left w-full">
          <div className="p-5 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1.5 shadow-lg">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-xs text-violet-300 font-bold mb-2">
              🛡️
            </div>
            <h2 className="text-sm font-bold text-white">Multi-Tenant Isolation</h2>
            <p className="text-xs text-slate-400 leading-relaxed">Strict tenant data isolation and role-based permissions (OWNER, ADMIN, STAFF).</p>
          </div>

          <div className="p-5 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1.5 shadow-lg">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-xs text-cyan-300 font-bold mb-2">
              🧠
            </div>
            <h2 className="text-sm font-bold text-white">BizPilot Autopilot</h2>
            <p className="text-xs text-slate-400 leading-relaxed">Real-time telemetry, daily action plans, and automated financial write previews.</p>
          </div>

          <div className="p-5 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1.5 shadow-lg">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs text-emerald-300 font-bold mb-2">
              💬
            </div>
            <h2 className="text-sm font-bold text-white">WhatsApp AI Bot</h2>
            <p className="text-xs text-slate-400 leading-relaxed">Interactive WhatsApp bot for instant voice/text sales logging and invoice dispatch.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-white/[0.08] text-center text-xs text-slate-500 relative z-10">
        © 2026 BizPilot AI. Production-ready autonomous multi-tenant business operating system.
      </footer>
    </div>
  );
}
