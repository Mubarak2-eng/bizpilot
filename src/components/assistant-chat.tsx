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
        // Live auto-refresh of background components/metrics
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
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto w-full p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black text-white tracking-tight">
                BizPilot AI Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Action-Enabled
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Operating for {business.name} ({userRole}) • Controlled Business Actions
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            Clear Chat
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between">
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
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="max-w-md space-y-1.5">
              <h2 className="text-base font-bold text-white">Ask questions or draft business actions</h2>
              <p className="text-xs text-slate-400">
                I can analyze metrics and prepare verified actions like drafting invoices, recording sales, and logging expenses.
              </p>
            </div>

            {/* Suggested Prompt Chips */}
            <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className="p-3 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl text-xs text-slate-300 hover:text-white transition flex items-center justify-between cursor-pointer group"
                >
                  <span className="truncate">{prompt}</span>
                  <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
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
                className={`max-w-2xl p-4 rounded-2xl text-xs leading-relaxed space-y-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-xs shadow-md shadow-indigo-600/20"
                    : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-xs shadow-md"
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
              <span className="text-[10px] text-slate-500 mt-1 px-1">
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
            <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl rounded-bl-xs flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse delay-100" />
              <div className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse delay-200" />
              <span className="text-xs text-slate-400 ml-1">Analyzing and checking records...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="pt-2 border-t border-slate-800/80">
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
            className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            type="submit"
            disabled={isPending || !inputQuery.trim() || Boolean(actionPendingId)}
            className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-30 disabled:hover:bg-indigo-600 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
 * Visual Action Confirmation Preview Card
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
      <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1.5">
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
      <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl text-[11px] text-slate-400">
        ✕ Action was cancelled. No changes were made.
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1">
        <span className="font-bold text-rose-400 text-xs">⚠️ Execution Error</span>
        <p className="text-[11px] text-slate-300">{resultMessage}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-950/80 border border-indigo-500/40 rounded-xl space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="font-bold text-xs text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          Action Confirmation Required
        </span>
        <span className="text-[10px] text-slate-400">5 min expiry</span>
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
            <span className="text-slate-300">{String(p.dueDate)}</span>
          </div>
          <div className="py-2 border-t border-b border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase block">Items & Pricing:</span>
            {Array.isArray(p.items) &&
              p.items.map((item: { name: string; quantity: number; unitPrice: string; total: string }, i: number) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>
                    {item.name} <strong className="text-slate-400">(x{item.quantity})</strong>
                  </span>
                  <span className="text-white font-medium">{item.total}</span>
                </div>
              ))}
          </div>
          <div className="flex justify-between pt-1 font-bold text-white">
            <span>Total with Tax ({String(p.tax)}):</span>
            <span className="text-emerald-400 text-sm">{String(p.total)}</span>
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
            <span className="text-indigo-300 font-semibold">{String(p.paymentMethod)}</span>
          </div>
          <div className="py-2 border-t border-b border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase block">Products to Sell:</span>
            {Array.isArray(p.items) &&
              p.items.map((item: { name: string; quantity: number; unitPrice: string; total: string }, i: number) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>
                    {item.name} <strong className="text-slate-400">(x{item.quantity})</strong>
                  </span>
                  <span className="text-white font-medium">{item.total}</span>
                </div>
              ))}
          </div>
          <div className="flex justify-between pt-1 font-bold text-white">
            <span>Grand Total:</span>
            <span className="text-emerald-400 text-sm">{String(p.total)}</span>
          </div>
        </div>
      )}

      {/* Expense Preview */}
      {action.actionType === "CREATE_EXPENSE" && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Category:</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200">
              {String(p.category)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Amount:</span>
            <span className="text-rose-400 font-bold text-sm">{String(p.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Description:</span>
            <span className="text-slate-300">{String(p.description)}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={() => onCancel(action.token)}
          disabled={isConfirming}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(action.token)}
          disabled={isConfirming}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
