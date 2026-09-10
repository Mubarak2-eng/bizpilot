import { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service | BizPilot AI",
  description:
    "Terms and conditions governing the access and use of BizPilot AI autonomous business management software.",
};

export default function TermsOfServicePage() {
  return (
    <LegalShell
      title="Terms of Service"
      subtitle="These Terms of Service govern your access to and use of BizPilot AI. By creating an account or using our platform, you agree to be bound by these terms."
      effectiveDate="September 10, 2026"
      badgeText="User Agreement"
      activePath="/terms"
    >
      {/* Summary Box */}
      <div className="p-4 sm:p-5 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          Key Terms Overview
        </h2>
        <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-1.5 list-disc list-inside">
          <li>
            <strong>BizPilot AI</strong> provides tools to manage inventory, record sales, issue invoices, log expenses, and automate messaging via AI.
          </li>
          <li>
            <strong>AI Assistance Disclaimer:</strong> AI-generated forecasts, drafts, and suggestions are decision-support tools. You retain ultimate responsibility for all confirmed business actions, pricing, and tax obligations.
          </li>
          <li>
            <strong>Your Data:</strong> You own your business and customer records. You represent that you have legal authority to process customer data.
          </li>
          <li>
            <strong>Subscription & Cancellation:</strong> You may cancel or modify paid plans (Starter, Pro, Business) at any time through your dashboard settings.
          </li>
        </ul>
      </div>

      {/* 1. Acceptance of Terms */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">1.</span> Acceptance of Terms
        </h2>
        <p>
          These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;User&quot;, &quot;Merchant&quot;, or &quot;Customer&quot;) and BizPilot AI (&quot;BizPilot&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). These Terms apply to your use of the BizPilot AI website, applications, dashboard, APIs, and connected messaging integrations (including the WhatsApp Cloud API integration).
        </p>
        <p>
          By creating an account, accessing, or using BizPilot AI, you agree to be bound by these Terms and our{" "}
          <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 underline font-semibold">
            Privacy Policy
          </Link>. If you do not agree to these Terms, you may not use our platform.
        </p>
      </section>

      {/* 2. Description of Services */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">2.</span> Description of Services
        </h2>
        <p>
          BizPilot AI provides a cloud-based software-as-a-service (SaaS) platform for modern enterprise operations, including:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li>Multi-tenant inventory tracking, SKU/barcode catalog management, and low-stock threshold alerting.</li>
          <li>Point of Sale (POS) and credit sales ledger recording, debtor tracking, and automated reminders.</li>
          <li>Automated invoice generation, tax/VAT calculation, and payment status monitoring.</li>
          <li>Natural language AI business copilots for voice/text querying and automated daily briefing.</li>
          <li>WhatsApp Business integration for interactive chat-based sales recording, expense logging, and customer engagement.</li>
        </ul>
      </section>

      {/* 3. Account Registration & User Roles */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">3.</span> Account Registration & User Roles
        </h2>
        <p>
          To access the platform, you must create an account by providing accurate, complete, and updated information. You are responsible for safeguarding your login credentials and for all activities that occur under your account.
        </p>
        <p>
          BizPilot supports role-based access control (OWNER, ADMIN, STAFF, MEMBER). Account Owners and Admins are responsible for managing staff access privileges, inviting authorized team members, and revoking credentials when personnel change.
        </p>
      </section>

      {/* 4. Acceptable Use & Prohibited Activities */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">4.</span> Acceptable Use & Prohibited Activities
        </h2>
        <p>You agree to use BizPilot AI only for lawful commercial purposes. You must NOT:</p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li>Use the platform for any fraudulent, deceptive, or unlawful commercial activities.</li>
          <li>Transmit unsolicited broadcast spam or violate the Meta WhatsApp Business Policy when utilizing WhatsApp integrations.</li>
          <li>Attempt to compromise platform security, reverse engineer code, bypass multi-tenant isolation barriers, or overload infrastructure.</li>
          <li>Upload viruses, malicious payloads, or harmful code.</li>
          <li>Resell, sublicense, or redistribute the platform software without express written authorization.</li>
        </ul>
      </section>

      {/* 5. User Data & Customer Responsibilities */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">5.</span> User Data & Customer Responsibilities
        </h2>
        <p>
          You retain all intellectual property rights and ownership in your business data, product catalogs, customer lists, and financial records.
        </p>
        <p>
          You are solely responsible for the legality, accuracy, and integrity of the data you input. When entering personal details of your customers (e.g., phone numbers for WhatsApp reminders or invoices), you represent that you have obtained the requisite customer consent under applicable privacy regulations.
        </p>
      </section>

      {/* 6. AI Assistant Disclaimer */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">6.</span> AI Assistant Disclaimer & Human Confirmation
        </h2>
        <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-slate-800 dark:text-slate-200 text-xs sm:text-sm space-y-2">
          <p>
            <strong>Decision-Support Disclaimer:</strong> BizPilot AI incorporates artificial intelligence and machine learning models to generate insights, summarize performance, and create preliminary action drafts (e.g., invoices, sales, expenses).
          </p>
          <p>
            <strong>Human Confirmation:</strong> All consequential business writes require explicit human confirmation (e.g., confirming draft details before creation). You are solely responsible for reviewing all AI drafts, stock levels, calculations, pricing, and tax totals before finalizing transactions.
          </p>
          <p>
            BizPilot AI does not provide certified legal, financial, accounting, or tax advice. You should consult professional advisors for statutory tax filings and compliance matters.
          </p>
        </div>
      </section>

      {/* 7. Subscriptions, Payments & Cancellations */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">7.</span> Subscriptions, Billing, Trials & Cancellations
        </h2>
        <p>
          Certain features of BizPilot AI (such as advanced WhatsApp AI automation and higher AI query limits) require a paid subscription (Starter, Pro, or Business).
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li><strong>Free Trials:</strong> New workspaces may receive a trial period. Upon expiration of the trial, an active paid plan is required to maintain access to premium features.</li>
          <li><strong>Billing & Renewals:</strong> Subscriptions are billed on a recurring monthly basis via our payment partner (Paystack). Fees are non-refundable except where required by law.</li>
          <li><strong>Quota Enforcement:</strong> AI queries and staff seats are subject to monthly plan limits. Excess usage may require upgrading to a higher tier.</li>
          <li><strong>Cancellation:</strong> You may cancel or downgrade your subscription at any time via Settings → Subscription. Your access to paid features will remain active until the end of the current billing cycle.</li>
        </ul>
      </section>

      {/* 8. Intellectual Property */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">8.</span> Intellectual Property Rights
        </h2>
        <p>
          BizPilot AI, including its proprietary software, user interface design, logo, algorithms, trademarks, and documentation, is the exclusive property of BizPilot AI and its licensors. We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the platform in accordance with these Terms.
        </p>
      </section>

      {/* 9. Service Availability & Maintenance */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">9.</span> Service Availability & Maintenance
        </h2>
        <p>
          We strive to provide continuous, high-availability service. However, access to the platform may be temporarily interrupted for maintenance, software upgrades, or due to third-party outages (e.g., cloud hosting, telecommunications, or Meta WhatsApp API downtime). We are not liable for any losses caused by temporary platform unavailability.
        </p>
      </section>

      {/* 10. Limitation of Liability */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">10.</span> Limitation of Liability & Disclaimers
        </h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BIZPILOT AI IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
        </p>
        <p>
          IN NO EVENT SHALL BIZPILOT AI, ITS DIRECTORS, EMPLOYEES, OR PARTNERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA LOSS, REVENUE, OR BUSINESS OPPORTUNITIES ARISING FROM OR RELATED TO YOUR USE OF THE PLATFORM.
        </p>
      </section>

      {/* 11. Termination */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">11.</span> Termination & Suspension
        </h2>
        <p>
          You may terminate your account at any time by requesting deletion of your workspace. We reserve the right to suspend or terminate your access immediately if you violate these Terms, engage in fraudulent activity, or fail to pay subscription fees.
        </p>
      </section>

      {/* 12. Governing Law */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">12.</span> Governing Law & Dispute Resolution
        </h2>
        <p>
          These Terms shall be governed by and construed in accordance with applicable commercial laws. Any disputes arising under or in connection with these Terms shall first be addressed through good-faith informal negotiations, and if unresolved, through binding arbitration or competent commercial courts.
        </p>
      </section>

      {/* 13. Modifications */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">13.</span> Changes to these Terms
        </h2>
        <p>
          We may revise these Terms from time to time. If a revision is material, we will provide at least 15 days notice via email or in-app dashboard notification prior to the new terms taking effect. Continued use of the platform after revisions constitutes acceptance.
        </p>
      </section>

      {/* 14. Contact */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-indigo-600 dark:text-indigo-400">14.</span> Contact Information
        </h2>
        <p>For questions or notices concerning these Terms of Service, please contact us:</p>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] text-xs sm:text-sm space-y-1">
          <p><strong>BizPilot AI Legal & Operations</strong></p>
          <p>Email: <a href="mailto:support@bizpilot.app" className="text-indigo-600 dark:text-indigo-400 font-semibold underline">support@bizpilot.app</a></p>
          <p>Website: <a href="https://bizpilot.app" className="text-indigo-600 dark:text-indigo-400 font-semibold underline">https://bizpilot.app</a></p>
        </div>
      </section>
    </LegalShell>
  );
}
