import { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | BizPilot AI",
  description:
    "Learn how BizPilot AI collects, processes, and protects your business and personal data in compliance with global data protection standards.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="This Privacy Policy describes how BizPilot AI collects, uses, stores, and protects your personal and business data across our platform, services, and integrations."
      effectiveDate="September 10, 2026"
      badgeText="Data Protection & Privacy"
      activePath="/privacy"
    >
      {/* Table of Contents / Summary Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-violet-500/5 dark:bg-violet-500/10 border border-violet-500/20 space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Summary & Key Takeaways
        </h2>
        <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
          <li>
            <strong>BizPilot AI</strong> is an AI-powered business management SaaS designed for commercial enterprises to manage inventory, sales, expenses, invoices, and automated communications.
          </li>
          <li>
            We collect only the data necessary to provide and secure our services, including business records and connected WhatsApp interactions.
          </li>
          <li>
            We never sell your personal or business data. We use enterprise-grade subprocessors (Vercel, Neon, OpenAI, Meta, Flutterwave, Resend).
          </li>
          <li>
            You retain full control of your data and can request complete deletion at any time via our{" "}
            <Link href="/data-deletion" className="text-violet-600 dark:text-violet-400 underline font-semibold">
              Data Deletion instructions
            </Link>.
          </li>
        </ul>
      </div>

      {/* 1. Introduction */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">1.</span> Introduction & Scope
        </h2>
        <p>
          <strong>Bizpilot</strong> (&quot;Company&quot;, &quot;BizPilot AI&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is the legal business entity that owns and operates the BizPilot AI cloud-based business operating system and software-as-a-service (SaaS) platform (https://bizpilot.ng). Our services include inventory intelligence, Point of Sale (POS) tools, invoice generation, expense tracking, autonomous AI copilot analytics, and automated messaging integrations.
        </p>
        <p>
          This Privacy Policy applies to all users of the BizPilot AI web application, APIs, dashboard, and connected messaging channels (including the Meta WhatsApp Cloud API integration). By accessing or using BizPilot AI, you acknowledge that you have read and understood this Privacy Policy.
        </p>
      </section>

      {/* 2. Information We Collect */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">2.</span> Information We Collect
        </h2>
        <p>
          To operate the BizPilot AI platform effectively, we collect information across several categories:
        </p>
        <div className="space-y-4 pt-1">
          <div className="border-l-2 border-violet-500 pl-4 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">A. Account & Profile Information</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              When you register for BizPilot, we collect your full name, email address, encrypted password credentials, optional profile picture, and workspace membership roles (e.g., OWNER, ADMIN, STAFF, MEMBER).
            </p>
          </div>

          <div className="border-l-2 border-indigo-500 pl-4 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">B. Business & Workspace Configuration</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Business legal and trade name, URL slug, industry category (e.g., Retail, Restaurant, Pharmacy, Fashion, Electronics, Supermarket), default reporting currency (e.g., NGN, USD), and tax/VAT preferences.
            </p>
          </div>

          <div className="border-l-2 border-cyan-500 pl-4 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">C. Operational & Commercial Data</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Information you enter regarding products (names, SKUs, barcodes, cost and selling prices, stock quantities), customer profiles (names, phone numbers, email addresses, delivery addresses), sales records, payment methods, credit/debtor balances, expense logs, and invoices.
            </p>
          </div>

          <div className="border-l-2 border-emerald-500 pl-4 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">D. Connected Services & WhatsApp Communications</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              When you connect a WhatsApp Business number or interact with our WhatsApp AI Assistant, we process sender phone numbers, incoming message text, interactive button selections, action confirmation tokens, message timestamps, and delivery statuses necessary to execute requested operations.
            </p>
          </div>

          <div className="border-l-2 border-amber-500 pl-4 space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">E. Usage, Telemetry & Device Information</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Browser type, IP address, device telemetry, request timestamps, AI token usage metrics, rate limit metrics, and subscription status to maintain security, optimize platform performance, and enforce quota entitlements.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Customer Data & Merchant Responsibility */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">3.</span> Customer Data & Merchant Responsibility
        </h2>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
          <strong>Important Notice:</strong> You, as the merchant/business subscriber, act as the data controller for any customer information (such as your buyers&apos; names, phone numbers, or purchase histories) that you enter or synchronize into BizPilot AI. You warrant that you have obtained all necessary consents and legal rights under applicable privacy laws to collect and process your customers&apos; personal data through our platform.
        </div>
      </section>

      {/* 4. How We Use Information */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">4.</span> How We Use Your Information
        </h2>
        <p>We process your data strictly for legitimate business and operational purposes, including:</p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li><strong>Delivering Core SaaS Services:</strong> Maintaining real-time inventory tracking, processing point-of-sale checkout, calculating debtor balances, and generating official PDF invoices.</li>
          <li><strong>Powering AI Business Intelligence:</strong> Generating natural language financial summaries, sales analytics, low-stock forecasts, and autonomous daily morning briefs.</li>
          <li><strong>Executing Interactive Actions:</strong> Processing natural-language WhatsApp commands (e.g., &quot;Record sale 3 Power Banks&quot;) through our secure two-step preview and confirmation pipeline.</li>
          <li><strong>Transactional Communications:</strong> Sending automated debtor reminders, low-stock email notifications, subscription billing receipts, and security verification codes (OTP).</li>
          <li><strong>Security & Abuse Prevention:</strong> Verifying webhook signatures via HMAC SHA-256, deduplicating incoming messages, mitigating denial-of-service threats via sliding-window rate limiting, and safeguarding multi-tenant isolation.</li>
          <li><strong>Billing & Subscription Management:</strong> Managing paid plan tiers (Starter, Pro, Business) and recording payment transaction references.</li>
        </ul>
      </section>

      {/* 5. Third-Party Subprocessors */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">5.</span> Third-Party Service Providers & Subprocessors
        </h2>
        <p>
          We partner with vetted, industry-leading third-party service providers to host, secure, and deliver BizPilot AI. These providers only process data as necessary to perform specific infrastructural tasks:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Vercel Inc.</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cloud application hosting, Next.js edge runtime, and global CDN content delivery.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Neon / PostgreSQL</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Serverless encrypted relational database for secure, multi-tenant persistence.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">OpenAI, LLC</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">AI natural-language processing. Prompts are processed strictly to generate responses and are not used to train foundation models.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Meta Platforms, Inc.</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">WhatsApp Business Cloud API infrastructure for receiving webhooks and transmitting authorized customer messages.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Flutterwave Payments Limited</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">PCI-DSS compliant payment processing for recurring subscriptions and billing. We do not store full payment card numbers.</p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Resend, Inc.</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Transactional email delivery for account verification, password resets, and critical business alert notifications.</p>
          </div>
        </div>
      </section>

      {/* 6. Data Security */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">6.</span> Data Security & Multi-Tenant Isolation
        </h2>
        <p>
          We employ robust technical and organizational security safeguards designed to protect your data against unauthorized access, destruction, loss, or alteration:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li><strong>Tenant Isolation:</strong> All database queries are strictly partitioned by authenticated workspace identifiers (<code className="text-[11px] font-mono bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">businessId</code>). Users cannot query or modify data belonging to other businesses.</li>
          <li><strong>Encryption:</strong> Data in transit is encrypted using TLS 1.3 / HTTPS. Data at rest in our PostgreSQL database is encrypted using industry-standard AES-256 encryption.</li>
          <li><strong>Credential Hashing:</strong> Passwords and verification codes (OTP) are hashed using salted cryptographic algorithms (bcrypt and HMAC SHA-256) and are never stored in plaintext.</li>
          <li><strong>Webhook Protection:</strong> Meta WhatsApp webhook payloads are cryptographically verified using SHA-256 signatures before being queued or processed.</li>
        </ul>
      </section>

      {/* 7. Data Retention & Lifecycle */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">7.</span> Data Retention & Lifecycle
        </h2>
        <p>
          We retain your business records for as long as your workspace remains active. When you close your account or request data deletion:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li>Your account credentials, product catalogs, customer databases, and active sessions will be permanently purged within 30 calendar days.</li>
          <li>Ephemeral data (such as temporary OTP hashes, action confirmation tokens, and message deduplication IDs) are automatically purged within 2 hours to 30 days.</li>
          <li>We may retain anonymized usage statistics and financial transaction audit logs only where strictly required by statutory tax and financial reporting laws.</li>
        </ul>
      </section>

      {/* 8. User Rights */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">8.</span> Your Rights & Privacy Controls
        </h2>
        <p>Depending on your jurisdiction (e.g., NDPR, GDPR, CCPA), you have the right to:</p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li><strong>Access & Export:</strong> Access your business information, sales ledgers, customer records, and invoices directly from your dashboard.</li>
          <li><strong>Correction:</strong> Update or rectify incomplete or inaccurate information via your workspace Settings.</li>
          <li><strong>Integration Control:</strong> Disconnect or unlink your WhatsApp Business number at any time in Settings → WhatsApp AI Integration.</li>
          <li><strong>Erasure / Deletion:</strong> Request full erasure of your account and business data by following our{" "}
            <Link href="/data-deletion" className="text-violet-600 dark:text-violet-400 underline font-semibold">
              Data Deletion instructions
            </Link>.
          </li>
        </ul>
      </section>

      {/* 9. Cookies & Local Storage */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">9.</span> Cookies & Local Storage
        </h2>
        <p>
          BizPilot AI uses essential session cookies and local storage tokens to manage authentication state, active business selection, and visual theme preferences (<code className="text-[11px] font-mono bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">bizpilot-theme</code>). We do not use third-party behavioral advertising cookies or track users across external websites.
        </p>
      </section>

      {/* 10. Children's Privacy */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">10.</span> Children&apos;s Privacy
        </h2>
        <p>
          BizPilot AI is designed strictly for commercial enterprises and business owners aged 18 and older. We do not knowingly collect or solicit personal information from minors.
        </p>
      </section>

      {/* 11. Policy Changes */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">11.</span> Changes to this Policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time to reflect technological improvements, new feature releases, or legal requirements. Material updates will be communicated through in-app dashboard notices or email announcements with an updated effective date.
        </p>
      </section>

      {/* 12. Contact */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">12.</span> Legal Entity & Data Protection Contact
        </h2>
        <p>
          If you have questions, feedback, or privacy requests regarding this policy or how your data is handled, please contact our legal entity and data protection team:
        </p>
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02] text-xs sm:text-sm space-y-2">
          <p><strong>Legal Entity Name:</strong> Bizpilot</p>
          <p><strong>Operating Brand:</strong> BizPilot AI</p>
          <p><strong>Registered Address:</strong> 52 Igi Olugbin St, Bariga, Lagos, Nigeria</p>
          <p><strong>Official Phone:</strong> <a href="tel:+2348163374311" className="text-violet-600 dark:text-violet-400 font-semibold underline">+2348163374311</a></p>
          <p><strong>Privacy & Compliance Email:</strong> <a href="mailto:support@bizpilot.ng" className="text-violet-600 dark:text-violet-400 font-semibold underline">support@bizpilot.ng</a></p>
          <p><strong>Website:</strong> <a href="https://bizpilot.ng" className="text-violet-600 dark:text-violet-400 font-semibold underline">https://bizpilot.ng</a></p>
        </div>
      </section>
    </LegalShell>
  );
}
