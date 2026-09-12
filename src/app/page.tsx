import Link from "next/link";
import { auth } from "@/auth";
import ThemeToggle from "@/components/theme-toggle";
import LandingProductTabs from "@/components/landing-product-tabs";
import LandingFAQ from "@/components/landing-faq";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-mesh-dark text-slate-900 dark:text-white flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 antialiased relative overflow-hidden">
      {/* Background glow flares */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-tr from-violet-600/15 via-indigo-600/20 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full border-b border-slate-200/80 dark:border-white/[0.08] relative z-10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-md shadow-indigo-600/20 dark:shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[10px] flex items-center justify-center font-black text-white text-base tracking-tight">
              BP
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg tracking-tight text-slate-900 dark:text-white">BizPilot AI</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30">
                OS
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />

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
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
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

      {/* Main Content */}
      <main className="flex-1 w-full relative z-10 flex flex-col">
        {/* A. Hero Section */}
        <section className="max-w-4xl mx-auto px-6 py-20 text-center space-y-8 flex flex-col justify-center items-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-xs font-semibold backdrop-blur-md shadow-xs dark:shadow-[0_0_20px_-5px_rgba(139,92,246,0.3)]">
            <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-beacon" />
            2026 Production Ready • WhatsApp Cloud Integration • Multi-Tenant Security
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.1]">
            The Autonomous AI Business <br /> Operating System for <br />
            <span className="gradient-text-ai">African & Global Enterprises</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            Multi-tenant inventory intelligence, POS terminal, WhatsApp automation, and autonomous AI copilot — built for growing African & global businesses.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
            <Link
              href="/signup"
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/25 dark:shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all cursor-pointer border border-violet-300/30"
            >
              Get Started Free
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto px-7 py-3.5 bg-white/80 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white font-semibold text-sm rounded-xl border border-slate-200 dark:border-white/[0.1] hover:border-violet-500/40 backdrop-blur-xl transition cursor-pointer shadow-xs"
            >
              See How BizPilot Works
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-6 pt-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <span>✓ 500+ Businesses</span>
            <span>✓ Multi-Currency Support</span>
            <span>✓ Bank-Grade Security</span>
          </div>
        </section>

        {/* B. Product Showcase */}
        <section id="features" className="max-w-6xl mx-auto w-full px-6 py-20 border-t border-slate-200/80 dark:border-white/[0.05]">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Everything Your Business Needs</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg">From inventory to AI — all in one platform.</p>
          </div>
          <LandingProductTabs />
        </section>

        {/* C. Industry Solutions */}
        <section className="max-w-6xl mx-auto w-full px-6 py-20 border-t border-slate-200/80 dark:border-white/[0.05]">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Built for Your Type of Business</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: "🏪", title: "Retail & Supermarkets", desc: "Fast barcode POS, reorder alerts, multi-cashier support" },
              { icon: "💊", title: "Pharmacies", desc: "Expiry tracking, batch numbers, rapid receipts" },
              { icon: "👗", title: "Fashion & Boutiques", desc: "Customer credit ledger, WhatsApp re-engagement" },
              { icon: "🍽️", title: "Restaurants & Lounges", desc: "Daily shift totals, expense tracking, transfer reconciliation" },
              { icon: "📱", title: "Phone & Electronics", desc: "Warranty tracking, IMEI serial support, credit sales" },
              { icon: "✂️", title: "Salons & Services", desc: "Appointment logging, customer history, daily summaries" },
            ].map((ind, i) => (
              <div key={i} className="bg-slate-50 dark:bg-[#090e24]/60 border border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 flex items-start gap-4 transition hover:bg-slate-100 dark:hover:bg-[#090e24]/90">
                <div className="text-3xl">{ind.icon}</div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">{ind.title}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{ind.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* D. Transparent Pricing */}
        <section className="max-w-6xl mx-auto w-full px-6 py-20 border-t border-slate-200/80 dark:border-white/[0.05]">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Simple, Transparent Pricing</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg">Start free. Scale as you grow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { name: "Free", price: "₦0/month", features: ["25 AI queries/mo", "1 staff seat", "50 inventory items", "Standard POS"], btn: "Get Started Free", link: "/signup" },
              { name: "Starter", price: "₦5,000/month", features: ["250 AI queries/mo", "3 staff seats", "Unlimited inventory", "Daily email reports"], btn: "Choose Starter", link: "/signup" },
              { name: "Pro", price: "₦12,000/month", features: ["Unlimited AI queries", "WhatsApp integration", "Multi-staff roles", "Advanced analytics"], btn: "Choose Pro", link: "/signup", popular: true },
              { name: "Business", price: "Contact Us", features: ["Multi-branch support", "Dedicated onboarding", "Priority support", "Custom Integrations"], btn: "Contact Us", link: "mailto:support@bizpilot.ng" },
            ].map((plan, i) => (
              <div key={i} className={`flex flex-col bg-slate-50 dark:bg-[#090e24]/60 border ${plan.popular ? 'border-violet-500 shadow-lg shadow-violet-500/10 transform md:-translate-y-2' : 'border-slate-200 dark:border-white/[0.08]'} rounded-2xl p-6 relative`}>
                {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">Most Popular</span>}
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h4>
                <div className="text-2xl font-black text-slate-900 dark:text-white mb-6">{plan.price}</div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <span className="text-violet-500">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href={plan.link} className={`w-full py-2.5 rounded-xl font-bold text-sm text-center transition cursor-pointer ${plan.popular ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 dark:bg-white/[0.1] text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-white/[0.15]'}`}>
                  {plan.btn}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* E. Trust & Security */}
        <section className="max-w-6xl mx-auto w-full px-6 py-20 border-t border-slate-200/80 dark:border-white/[0.05]">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Enterprise-Grade Security</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { icon: "🔒", title: "Multi-Tenant Isolation", desc: "Your data is completely isolated from other businesses." },
              { icon: "👤", title: "Role-Based Access", desc: "Control exactly what each staff member can see and do." },
              { icon: "🔐", title: "Email PIN Authentication", desc: "Every login requires a 6-digit email verification code." },
              { icon: "💳", title: "Secure Payments", desc: "Payment processing through verified payment gateways." },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 dark:bg-[#090e24]/60 border border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 flex items-start gap-4">
                <div className="text-3xl">{item.icon}</div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">{item.title}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* F. FAQ */}
        <section className="max-w-6xl mx-auto w-full px-6 py-20 border-t border-slate-200/80 dark:border-white/[0.05]">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">Frequently Asked Questions</h2>
          </div>
          <LandingFAQ />
        </section>

        {/* G. Final CTA Banner */}
        <section className="max-w-4xl mx-auto w-full px-6 py-20">
          <div className="bg-[#090e24] border border-violet-500/30 rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden shadow-2xl shadow-violet-900/20">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-violet-600/20 to-transparent pointer-events-none" />
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 relative z-10">Ready to Run a Smarter Business?</h2>
            <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto relative z-10">
              Join businesses using BizPilot AI to manage sales, inventory, customers, and finances — all in one place.
            </p>
            <Link href="/signup" className="inline-block px-8 py-4 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer relative z-10">
              Create Your Free Account
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-slate-200/80 dark:border-white/[0.08] relative z-10 max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          © {new Date().getFullYear()} BizPilot AI. Production-ready autonomous multi-tenant business operating system.
        </div>
        <div className="flex items-center gap-4 font-medium">
          <Link href="/privacy" className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            Terms of Service
          </Link>
          <Link href="/data-deletion" className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            Data Deletion
          </Link>
        </div>
      </footer>
    </div>
  );
}
