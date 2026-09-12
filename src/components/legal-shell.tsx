import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";

interface LegalShellProps {
  title: string;
  subtitle?: string;
  effectiveDate?: string;
  badgeText?: string;
  children: React.ReactNode;
  activePath?: "/privacy" | "/terms" | "/data-deletion";
}

export default function LegalShell({
  title,
  subtitle,
  effectiveDate,
  badgeText = "Legal & Compliance",
  children,
  activePath,
}: LegalShellProps) {
  return (
    <div className="min-h-screen bg-mesh-dark text-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 antialiased relative">
      {/* Background glow flares */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-violet-600/15 via-indigo-600/15 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header / Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-white/[0.08] backdrop-blur-xl bg-white/75 dark:bg-[#050711]/75 transition-colors">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-xl"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-sm shadow-indigo-600/20 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all">
              <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[9px] flex items-center justify-center font-black text-white text-sm tracking-tight">
                BP
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-base tracking-tight text-slate-900 dark:text-white">
                BizPilot AI
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 hidden sm:inline-block">
                Legal
              </span>
            </div>
          </Link>

          {/* Legal Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
            <Link
              href="/privacy"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activePath === "/privacy"
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activePath === "/terms"
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              Terms of Service
            </Link>
            <Link
              href="/data-deletion"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activePath === "/data-deletion"
                  ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              User Data Deletion
            </Link>
          </nav>

          {/* Actions: Theme Toggle & Sign In */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all border border-violet-300/30"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Mobile Navigation Sub-bar */}
        <div className="flex md:hidden border-t border-slate-200/60 dark:border-white/[0.05] px-4 py-2 gap-2 overflow-x-auto text-[11px] font-semibold no-scrollbar bg-slate-50/50 dark:bg-black/20">
          <Link
            href="/privacy"
            className={`whitespace-nowrap px-2.5 py-1 rounded-md ${
              activePath === "/privacy"
                ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className={`whitespace-nowrap px-2.5 py-1 rounded-md ${
              activePath === "/terms"
                ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Terms
          </Link>
          <Link
            href="/data-deletion"
            className={`whitespace-nowrap px-2.5 py-1 rounded-md ${
              activePath === "/data-deletion"
                ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Data Deletion
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 flex-1 w-full relative z-10 space-y-8">
        {/* Document Header Hero */}
        <div className="space-y-3 pb-6 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-xs font-semibold backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400" />
            {badgeText}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          )}
          {effectiveDate && (
            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>📅 Effective Date:</span>
              <strong className="text-slate-700 dark:text-slate-300">{effectiveDate}</strong>
              <span className="text-slate-400">•</span>
              <span>Version 1.2 (Production)</span>
            </div>
          )}
        </div>

        {/* Legal Body / Articles */}
        <div className="bg-white/85 dark:bg-[#090e24]/75 border border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 sm:p-10 backdrop-blur-xl shadow-sm text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed space-y-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/[0.08] py-8 px-4 sm:px-6 relative z-10 bg-white/40 dark:bg-black/20 backdrop-blur-md mt-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-violet-600 to-cyan-400 flex items-center justify-center font-bold text-white text-[10px]">
              BP
            </div>
            <span>© {new Date().getFullYear()} BizPilot AI. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-5 font-medium">
            <Link
              href="/privacy"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/data-deletion"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              Data Deletion
            </Link>
            <a
              href="mailto:support@bizpilot.ng"
              className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
