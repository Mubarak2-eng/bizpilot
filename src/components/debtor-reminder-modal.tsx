"use client";

import { useState, useEffect, useTransition } from "react";
import { ReminderTone } from "@/lib/debtors/messaging";
import {
  getDebtorReminderPreviewAction,
  sendDebtorWhatsAppReminderAction,
  sendDebtorEmailReminderAction,
  DebtorReminderPreviewResult,
} from "@/lib/actions/debtors";

interface DebtorReminderModalProps {
  businessId: string;
  currency: string;
  customerId: string;
  customerName: string;
  saleId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export default function DebtorReminderModal({
  businessId,
  currency,
  customerId,
  customerName,
  saleId,
  isOpen,
  onClose,
  onSuccess,
}: DebtorReminderModalProps) {
  const [tone, setTone] = useState<ReminderTone>("FRIENDLY");
  const [message, setMessage] = useState<string>("");
  const [isCustomEdited, setIsCustomEdited] = useState(false);
  const [preview, setPreview] = useState<DebtorReminderPreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message?: string; error?: string; clickToChatUrl?: string } | null>(null);

  // Load reminder preview from server on modal open or tone change (if not custom edited)
  useEffect(() => {
    if (!isOpen || !customerId) return;

    let isMounted = true;

    queueMicrotask(() => {
      if (isMounted) {
        setIsLoadingPreview(true);
        setFeedback(null);
      }
    });

    void (async () => {
      const res = await getDebtorReminderPreviewAction(businessId, customerId, saleId, tone);
      if (!isMounted) return;
      setIsLoadingPreview(false);
      if (res.success && res.customer) {
        setPreview(res);
        if (!isCustomEdited || !message) {
          setMessage(res.message || "");
        }
        if (res.suggestedTone && !preview) {
          setTone(res.suggestedTone);
        }
      } else {
        setFeedback({ error: res.error || "Failed to load debtor preview." });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, businessId, customerId, saleId, tone]);

  // Handle tone change
  const handleToneChange = (newTone: ReminderTone) => {
    setTone(newTone);
    setIsCustomEdited(false);
    setIsLoadingPreview(true);
    setFeedback(null);

    getDebtorReminderPreviewAction(businessId, customerId, saleId, newTone).then((res) => {
      setIsLoadingPreview(false);
      if (res.success) {
        setPreview(res);
        setMessage(res.message || "");
      }
    });
  };

  const handleResetToTemplate = () => {
    setIsCustomEdited(false);
    if (preview?.message) {
      setMessage(preview.message);
    }
  };

  const handleSendWhatsApp = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await sendDebtorWhatsAppReminderAction(
        businessId,
        customerId,
        saleId,
        message,
        tone
      );

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        const successMsg = res.message || "WhatsApp reminder prepared.";
        setFeedback({
          message: successMsg,
          clickToChatUrl: res.clickToChatUrl,
        });

        // If click-to-chat URL provided, trigger open
        if (res.clickToChatUrl) {
          window.open(res.clickToChatUrl, "_blank", "noopener,noreferrer");
        }

        if (onSuccess) {
          onSuccess(successMsg);
        }
      }
    });
  };

  const handleSendEmail = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await sendDebtorEmailReminderAction(
        businessId,
        customerId,
        saleId,
        message,
        tone
      );

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        const successMsg = res.message || "Email reminder sent successfully.";
        setFeedback({ message: successMsg });
        if (onSuccess) {
          onSuccess(successMsg);
        }
      }
    });
  };

  if (!isOpen) return null;

  const phoneAvailable = Boolean(preview?.canSendWhatsApp);
  const emailAvailable = Boolean(preview?.canSendEmail);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-violet-500/30 rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl space-y-5 my-8 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wide">
                💬 Debtor Communications
              </span>
              {preview?.isOverdue && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 animate-pulse">
                  {preview.overdueDays}d Overdue
                </span>
              )}
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
              Send Payment Reminder
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Notify <strong className="text-slate-900 dark:text-white">{customerName}</strong> of their outstanding balance
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition"
          >
            ✕
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-medium transition-all space-y-2 relative z-10 ${
              feedback.error
                ? "bg-rose-50 dark:bg-rose-950/30 border-rose-500/30 text-rose-800 dark:text-rose-300"
                : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span>{feedback.error ? "⚠️" : "✅"}</span>
                <span>{feedback.error || feedback.message}</span>
              </span>
              <button
                onClick={() => setFeedback(null)}
                className="opacity-70 hover:opacity-100 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            {feedback.clickToChatUrl && (
              <div className="pt-1">
                <a
                  href={feedback.clickToChatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shadow-xs transition"
                >
                  <span>Open WhatsApp Web / App →</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Debt Snapshot Summary Card */}
        <div className="p-3.5 bg-slate-50 dark:bg-[#050816] rounded-2xl border border-slate-200 dark:border-white/[0.08] grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs relative z-10">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
              Outstanding Debt
            </span>
            <span className="text-sm font-mono font-black text-amber-600 dark:text-amber-400">
              {preview?.formattedOutstanding || `${currency} 0.00`}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
              Due Date
            </span>
            <span className="text-xs font-mono text-slate-800 dark:text-slate-200">
              {preview?.dueDate
                ? new Date(preview.dueDate).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "No specific date"}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
              Channel Availability
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  phoneAvailable
                    ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                    : "bg-slate-200 dark:bg-white/[0.06] text-slate-400"
                }`}
                title={preview?.customer?.phone || "No phone on file"}
              >
                WA: {phoneAvailable ? "✓" : "✗"}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                  emailAvailable
                    ? "bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300"
                    : "bg-slate-200 dark:bg-white/[0.06] text-slate-400"
                }`}
                title={preview?.customer?.email || "No email on file"}
              >
                Email: {emailAvailable ? "✓" : "✗"}
              </span>
            </div>
          </div>
        </div>

        {/* Template Tone Selector */}
        <div className="space-y-1.5 relative z-10">
          <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Choose Reminder Tone / Template:
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleToneChange("FRIENDLY")}
              className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                tone === "FRIENDLY"
                  ? "bg-cyan-50 dark:bg-cyan-500/15 border-cyan-500/50 text-cyan-900 dark:text-cyan-200 font-bold shadow-xs"
                  : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span className="block text-sm mb-0.5">😊</span>
              <span className="block text-[11px] font-semibold">Friendly</span>
            </button>

            <button
              type="button"
              onClick={() => handleToneChange("OVERDUE")}
              className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                tone === "OVERDUE"
                  ? "bg-amber-50 dark:bg-amber-500/15 border-amber-500/50 text-amber-900 dark:text-amber-200 font-bold shadow-xs"
                  : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span className="block text-sm mb-0.5">⏳</span>
              <span className="block text-[11px] font-semibold">Overdue</span>
            </button>

            <button
              type="button"
              onClick={() => handleToneChange("FINAL_NOTICE")}
              className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                tone === "FINAL_NOTICE"
                  ? "bg-rose-50 dark:bg-rose-950/40 border-rose-500/50 text-rose-900 dark:text-rose-200 font-bold shadow-xs"
                  : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span className="block text-sm mb-0.5">⚠️</span>
              <span className="block text-[11px] font-semibold">Final Notice</span>
            </button>
          </div>
        </div>

        {/* Editable Message Textarea */}
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center justify-between">
            <label
              htmlFor="reminder-message-input"
              className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
            >
              Message Content (Editable):
            </label>
            <div className="flex items-center gap-2">
              {isCustomEdited && (
                <button
                  type="button"
                  onClick={handleResetToTemplate}
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  ↺ Reset template
                </button>
              )}
              <span className="text-[10px] font-mono text-slate-400">
                {message.length} chars
              </span>
            </div>
          </div>

          <textarea
            id="reminder-message-input"
            rows={6}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setIsCustomEdited(true);
            }}
            disabled={isLoadingPreview}
            placeholder={isLoadingPreview ? "Generating customized reminder message..." : "Write reminder message..."}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 leading-relaxed shadow-xs disabled:opacity-60"
          />
        </div>

        {/* Modal Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/[0.08] relative z-10">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Send via Email Button */}
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={isPending || isLoadingPreview || !emailAvailable || !message.trim()}
              title={emailAvailable ? `Send email to ${preview?.customer?.email}` : "Customer has no valid email on file"}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5"
            >
              <span>📧</span>
              <span>{isPending ? "Sending..." : "Send Email"}</span>
            </button>

            {/* Send via WhatsApp Button */}
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isPending || isLoadingPreview || !phoneAvailable || !message.trim()}
              title={phoneAvailable ? `Send WhatsApp to ${preview?.customer?.phone}` : "Customer has no valid phone on file"}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-emerald-950/25 flex items-center justify-center gap-1.5"
            >
              <span>💬</span>
              <span>{isPending ? "Preparing..." : "Send WhatsApp"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
