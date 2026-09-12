import { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "User Data Deletion Instructions | BizPilot AI",
  description:
    "Official instructions for requesting full deletion of your BizPilot AI user account, business workspace, and connected Meta/WhatsApp data.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="User Data Deletion"
      subtitle="Official instructions and procedure for requesting complete erasure of your BizPilot AI account, business records, and connected WhatsApp/Meta data."
      effectiveDate="September 10, 2026"
      badgeText="Data Subject Rights & Meta Compliance"
      activePath="/data-deletion"
    >
      {/* Prominent Action Banner */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-red-500/10 via-amber-500/10 to-violet-500/10 border border-red-500/30 space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-bold">
          <span>🗑️</span> Request Deletion of Your Data
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          How to Request Complete Data Deletion
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          At BizPilot AI, we respect your privacy and data ownership. In compliance with data protection laws (NDPR, GDPR, CCPA) and Meta Platform Developer Policies, you have the right to request full permanent deletion of your personal account, business workspaces, and all associated operational records.
        </p>
      </div>

      {/* Meta Compliance Notice */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">1.</span> Meta & Facebook User Data Deletion Instructions
        </h2>
        <p>
          If you connected your WhatsApp Business Account or authenticated via Meta/Facebook login, BizPilot AI does not retain your data beyond what is strictly required to provide services to you.
        </p>
        <p>
          According to Meta Platform Developer Policies, this page provides explicit instructions on how you can request the deletion of any data obtained through Facebook Login or the WhatsApp Business Platform.
        </p>
      </section>

      {/* 2. Methods for Requesting Deletion */}
      <section className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">2.</span> Methods to Delete Your Data
        </h2>

        {/* Method A: Instant In-App Disconnect */}
        <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs">
              A
            </span>
            <span>Instant In-App WhatsApp Disconnection</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            To immediately disconnect and remove your WhatsApp Business number from BizPilot without deleting your entire business workspace:
          </p>
          <ol className="list-decimal list-inside text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-1 pl-1">
            <li>Log in to your BizPilot dashboard at <a href="https://bizpilot.ng/dashboard" className="text-violet-600 dark:text-violet-400 underline font-semibold">bizpilot.ng/dashboard</a>.</li>
            <li>Navigate to <strong>Settings</strong> from the left sidebar.</li>
            <li>Scroll to the <strong>WhatsApp AI Integration</strong> section.</li>
            <li>Click <strong>Disconnect WhatsApp</strong> and confirm.</li>
          </ol>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            This immediately purges the active WhatsApp connection record, conversation history, and pending session tokens from our database.
          </p>
        </div>

        {/* Method B: Email Deletion Request */}
        <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <span className="w-6 h-6 rounded-md bg-violet-500/20 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs">
              B
            </span>
            <span>Full Account & Workspace Erasure via Email</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            To request full permanent erasure of your user account, business workspace, customer database, sales history, and invoices:
          </p>
          <div className="p-3.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs space-y-1">
            <p><strong>Send an email to:</strong> <a href="mailto:support@bizpilot.ng" className="text-violet-600 dark:text-violet-400 font-bold underline">support@bizpilot.ng</a></p>
            <p><strong>Subject Line:</strong> <code className="font-mono bg-white dark:bg-black/40 px-1 py-0.5 rounded">Data Deletion Request - [Your Registered Email]</code></p>
          </div>
        </div>
      </section>

      {/* 3. What to Include in Your Deletion Request */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">3.</span> Information Required in Your Request
        </h2>
        <p>To verify account ownership and process your deletion safely, please specify the following details in your email:</p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li><strong>Registered Account Email:</strong> The email address associated with your BizPilot user login.</li>
          <li><strong>Business Workspace Name:</strong> The business name or URL slug you wish to delete.</li>
          <li><strong>Connected WhatsApp Phone Number:</strong> (Optional) The phone number connected to WhatsApp AI if applicable.</li>
          <li><strong>Desired Scope of Deletion:</strong> State whether you want to delete only a specific business workspace, or your entire user account and all associated records.</li>
        </ul>

        {/* Security Warning */}
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/25 text-red-900 dark:text-red-200 text-xs sm:text-sm space-y-1.5">
          <div className="font-bold flex items-center gap-1.5">
            <span>🛡️</span> Security & Anti-Phishing Guard:
          </div>
          <p>
            <strong>Do NOT include</strong> passwords, API keys, database connection strings, credit/debit card numbers, CVVs, or bank verification numbers (BVN) in your request. BizPilot staff will <strong>NEVER</strong> ask for your password, encryption keys, or financial secrets.
          </p>
        </div>
      </section>

      {/* 4. What Happens When Data is Deleted */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">4.</span> Scope of Data Erasure
        </h2>
        <p>Upon verification and execution of a full data deletion request, the following records are permanently destroyed:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400 pt-1">
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02]">
            <strong className="text-slate-900 dark:text-white block mb-1">User & Auth Records</strong>
            User profile, email, authentication tokens, team memberships, and saved preferences.
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02]">
            <strong className="text-slate-900 dark:text-white block mb-1">Catalog & Customers</strong>
            Products, SKU stock quantities, barcode associations, customer contact lists, and addresses.
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02]">
            <strong className="text-slate-900 dark:text-white block mb-1">WhatsApp & Sessions</strong>
            WhatsApp connection records, conversation history buffers, pending action vouchers, and rate-limit keys.
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02]">
            <strong className="text-slate-900 dark:text-white block mb-1">Commercial & AI Data</strong>
            Draft invoices, expense logs, AI usage metrics, autopilot morning brief logs, and business goals.
          </div>
        </div>
      </section>

      {/* 5. Statutory Retention Exceptions */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">5.</span> Statutory Retention Exceptions
        </h2>
        <p>
          In limited circumstances mandated by applicable laws and regulatory obligations:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <li>Completed subscription payment audit records (processed through Flutterwave) and legal transaction receipts may be retained in an archived, pseudonymized format for statutory tax, accounting, and anti-money laundering compliance periods.</li>
          <li>System security logs containing IP addresses may be retained for up to 90 days solely to protect the integrity of the platform against ongoing cyber threats or fraud investigations.</li>
        </ul>
      </section>

      {/* 6. Processing Timeline */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">6.</span> Review & Processing Timetable
        </h2>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] text-xs sm:text-sm space-y-2">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
            <span>⏱️</span> Timetable for Erasure
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            • <strong>Acknowledgment:</strong> Our support team will confirm receipt of your deletion request within <strong>48 to 72 hours</strong>.
          </p>
          <p className="text-slate-600 dark:text-slate-400">
            • <strong>Verification & Deletion:</strong> Following identity verification, all requested data will be permanently purged from active production systems within <strong>30 calendar days</strong>.
          </p>
          <p className="text-slate-600 dark:text-slate-400">
            • <strong>Confirmation:</strong> You will receive a final confirmation email once data destruction has been successfully completed.
          </p>
        </div>
      </section>

      {/* 7. Contact Support */}
      <section className="space-y-3">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="text-violet-600 dark:text-violet-400">7.</span> Contact Us
        </h2>
        <p>If you have any questions or require assistance with data deletion, please contact:</p>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.02] text-xs sm:text-sm space-y-1">
          <p><strong>BizPilot AI Support & Data Protection</strong></p>
          <p>Email: <a href="mailto:support@bizpilot.ng" className="text-violet-600 dark:text-violet-400 font-semibold underline">support@bizpilot.ng</a></p>
          <p>Website: <a href="https://bizpilot.ng" className="text-violet-600 dark:text-violet-400 font-semibold underline">https://bizpilot.ng</a></p>
        </div>
      </section>
    </LegalShell>
  );
}
