"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage, ActionPreviewData } from "@/lib/ai/types";
import { askAssistantAction } from "@/lib/actions/assistant";
import { confirmAIAction, cancelAIAction } from "@/lib/actions/assistant-actions";
import { Role } from "@/types/auth";

interface AssistantChatProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  userRole: Role;
}

const SUGGESTED_PROMPTS = [
  "What were my sales today?",
  "Show me my low-stock products.",
  "What were my top-selling products this month?",
  "How much did I spend this month?",
  "Who are my top customers?",
  "How much do customers owe me?",
];

export default function AssistantChat({ business, userRole }: AssistantChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending, actionPendingId]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || isPending) return;

    setError(null);
    setInputQuery("");

    const userMsg: ChatMessage = {
      id: `usr-${messages.length + 1}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory);

    startTransition(async () => {
      const res = await askAssistantAction(business.id, messages, text);
      if (res.error) {
        setError(res.error);
      } else if (res.message) {
        setMessages([...currentHistory, res.message]);
      }
    });
  };

  const handleConfirmAction = (msgId: string, token: string) => {
    setActionPendingId(msgId);
    setError(null);

    startTransition(async () => {
      const res = await confirmAIAction(token);
      setActionPendingId(null);

      if (res.error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, actionStatus: "ERROR", actionResult: res.error }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, actionStatus: "CONFIRMED", actionResult: res.message }
              : m
          )
        );
        router.refresh();
      }
    });
  };

  const handleCancelAction = (msgId: string, token: string) => {
    startTransition(async () => {
      await cancelAIAction(token);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, actionStatus: "CANCELLED", actionResult: "Action was cancelled by the user." }
            : m
        )
      );
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    if (messages.length > 0 && confirm("Clear current assistant conversation?")) {
      setMessages([]);
      setError(null);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4.5rem)] max-w-5xl mx-auto w-full p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="p-4 bg-[#090e24]/80 border border-white/[0.08] rounded-2xl backdrop-blur-xl flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 p-[1.5px] shadow-[0_0_20px_rgba(139,92,246,0.35)]">
              <div className="w-full h-full bg-[#080c1d] rounded-[14px] flex items-center justify-center text-cyan-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#080c1d] animate-beacon" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-black text-white tracking-tight">
                BizPilot AI Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Action-Enabled
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Copilot for <span className="text-slate-200 font-semibold">{business.name}</span> ({userRole}) • Autonomous Verification
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="px-3 py-1.5 bg-white/[0.04] hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-semibold border border-white/[0.08] hover:border-rose-500/30 transition cursor-pointer"
          >
            Clear Chat
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs opacity-75 hover:opacity-100 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-violet-600/30 via-indigo-600/30 to-cyan-400/30 border border-violet-500/30 flex items-center justify-center text-cyan-300 shadow-[0_0_30px_rgba(99,102,241,0.25)]">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>

            <div className="max-w-md space-y-1.5">
              <h2 className="text-lg font-black text-white">Ask questions or trigger verified actions</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                BizPilot AI analyzes your real-time financials and drafts verified operational transactions like invoices, sales records, and expenses.
              </p>
            </div>

            {/* Suggested Prompt Chips */}
            <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="p-3.5 bg-[#090e24]/70 hover:bg-[#10173b]/90 border border-white/[0.08] hover:border-violet-500/40 rounded-2xl text-xs text-slate-300 hover:text-white transition-all flex items-center justify-between cursor-pointer group shadow-sm"
                >
                  <span className="truncate">{prompt}</span>
                  <span className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    →
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-2xl p-4.5 rounded-2xl text-xs leading-relaxed space-y-3 ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-xs shadow-[0_0_20px_rgba(99,102,241,0.25)] border border-violet-400/30"
                    : "bg-[#090d24]/90 border border-white/[0.1] text-slate-200 rounded-bl-xs shadow-lg backdrop-blur-xl"
                }`}
              >
                <div className="whitespace-pre-wrap font-sans space-y-2">
                  {msg.content}
                </div>

                {/* Render Action Preview Cards */}
                {msg.actionPreview && (
                  <div className="pt-2">
                    <ActionPreviewCard
                      msgId={msg.id}
                      action={msg.actionPreview}
                      status={msg.actionStatus || "PENDING"}
                      resultMessage={msg.actionResult}
                      isConfirming={actionPendingId === msg.id}
                      onConfirm={(token) => handleConfirmAction(msg.id, token)}
                      onCancel={(token) => handleCancelAction(msg.id, token)}
                    />
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))
        )}

        {/* Loading Bubble */}
        {isPending && !actionPendingId && (
          <div className="flex flex-col items-start space-y-1">
            <div className="p-4 bg-[#090d24]/90 border border-white/[0.1] rounded-2xl rounded-bl-xs flex items-center gap-2.5 shadow-md">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse delay-100" />
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-200" />
              <span className="text-xs text-cyan-300 font-medium ml-1">Analyzing metrics and records...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="pt-2 border-t border-white/[0.06]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <textarea
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending || Boolean(actionPendingId)}
            placeholder={`Ask a question or request an action for ${business.name}... (e.g. 'Draft invoice for Chinedu for 2 power banks')`}
            rows={1}
            className="w-full pl-4 pr-14 py-3.5 bg-[#090d24]/90 border border-white/[0.1] focus:border-violet-500 rounded-2xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none shadow-lg transition-all"
          />
          <button
            type="submit"
            disabled={isPending || !inputQuery.trim() || Boolean(actionPendingId)}
            className="absolute right-2 p-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl transition disabled:opacity-30 disabled:hover:from-violet-600 disabled:hover:to-indigo-600 cursor-pointer shadow-md shadow-indigo-600/20"
          >
            <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
        <p className="text-[10px] text-slate-500 text-center mt-2">
          Financial writes require explicit user confirmation. All pricing is verified server-side.
        </p>
      </div>
    </div>
  );
}

/**
 * Visual Action Confirmation Preview Card (Fintech Voucher)
 */
function ActionPreviewCard({
  action,
  status,
  resultMessage,
  isConfirming,
  onConfirm,
  onCancel,
}: {
  msgId: string;
  action: ActionPreviewData;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "ERROR";
  resultMessage?: string;
  isConfirming: boolean;
  onConfirm: (token: string) => void;
  onCancel: (token: string) => void;
}) {
  const p = action.preview as Record<string, unknown>;

  if (status === "CONFIRMED") {
    return (
      <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-1.5 shadow-[0_0_20px_-8px_rgba(16,185,129,0.2)]">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>Action Confirmed & Executed</span>
        </div>
        <p className="text-[11px] text-slate-300">{resultMessage}</p>
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="p-3 bg-white/[0.02] border border-white/[0.08] rounded-xl text-[11px] text-slate-400">
        ✕ Action was cancelled. No database changes were made.
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl space-y-1">
        <span className="font-bold text-rose-400 text-xs">⚠️ Execution Error</span>
        <p className="text-[11px] text-slate-300">{resultMessage}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#070b1e] border border-violet-500/40 rounded-2xl space-y-3.5 shadow-[0_0_25px_-5px_rgba(139,92,246,0.3)]">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <span className="font-bold text-xs text-violet-300 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-beacon" />
          Action Confirmation Voucher
        </span>
        <span className="text-[10px] text-slate-400 font-mono">5 min expiry</span>
      </div>

      {/* Invoice Preview */}
      {action.actionType === "CREATE_INVOICE" && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Customer:</span>
            <span className="text-white font-bold">{(p.customer as { name: string })?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Due Date:</span>
            <span className="text-slate-300 font-mono">{String(p.dueDate)}</span>
          </div>
          <div className="py-2 border-t border-b border-white/[0.06] space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Line Items:</span>
            {Array.isArray(p.items) &&
              p.items.map((item: { name: string; quantity: number; unitPrice: string; total: string }, i: number) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>
                    {item.name} <strong className="text-slate-400 font-mono">(x{item.quantity})</strong>
                  </span>
                  <span className="text-white font-mono font-medium">{item.total}</span>
                </div>
              ))}
          </div>
          <div className="flex justify-between pt-1 font-bold text-white">
            <span>Total with Tax ({String(p.tax)}):</span>
            <span className="text-emerald-400 text-sm font-mono font-black">{String(p.total)}</span>
          </div>
        </div>
      )}

      {/* Sale Preview */}
      {action.actionType === "CREATE_SALE" && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Customer:</span>
            <span className="text-white font-bold">{String(p.customer)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Payment Method:</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-semibold text-[10px] border border-cyan-500/30">
              {String(p.paymentMethod)}
            </span>
          </div>
          <div className="py-2 border-t border-b border-white/[0.06] space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Products to Sell:</span>
            {Array.isArray(p.items) &&
              p.items.map((item: { name: string; quantity: number; unitPrice: string; total: string }, i: number) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>
                    {item.name} <strong className="text-slate-400 font-mono">(x{item.quantity})</strong>
                  </span>
                  <span className="text-white font-mono font-medium">{item.total}</span>
                </div>
              ))}
          </div>
          <div className="flex justify-between pt-1 font-bold text-white">
            <span>Grand Total:</span>
            <span className="text-emerald-400 text-sm font-mono font-black">{String(p.total)}</span>
          </div>
        </div>
      )}

      {/* Expense Preview */}
      {action.actionType === "CREATE_EXPENSE" && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Category:</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.06] text-slate-200 border border-white/[0.1]">
              {String(p.category)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Amount:</span>
            <span className="text-rose-400 font-black text-sm font-mono">{String(p.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Description:</span>
            <span className="text-slate-300">{String(p.description)}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
        <button
          onClick={() => onCancel(action.token)}
          disabled={isConfirming}
          className="px-3.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 rounded-xl text-xs font-semibold border border-white/[0.08] transition cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(action.token)}
          disabled={isConfirming}
          className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {isConfirming ? (
            "Processing..."
          ) : action.actionType === "CREATE_INVOICE" ? (
            "Create Invoice"
          ) : action.actionType === "CREATE_SALE" ? (
            "Complete Sale"
          ) : (
            "Record Expense"
          )}
        </button>
      </div>
    </div>
  );
}
