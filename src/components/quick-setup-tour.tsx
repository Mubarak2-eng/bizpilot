"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function openQuickSetupTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-bizpilot-tour"));
  }
}

interface QuickSetupTourProps {
  businessId: string;
  businessName: string;
}

const steps = [
  {
    icon: "🏠", title: "Your Business Command Center",
    desc: "See your business performance at a glance.",
    bullets: ["Today's sales & revenue", "Low-stock alerts", "Recent invoices & expenses"]
  },
  {
    icon: "📦", title: "Manage What You Sell",
    desc: "Keep your inventory accurate and always know what's in stock.",
    bullets: ["Add products with price & stock", "Set low-stock reorder alerts", "SKU/barcode support"]
  },
  {
    icon: "⚡", title: "Record Sales Quickly",
    desc: "Log sales fast with multiple payment methods and generate instant receipts.",
    bullets: ["Cash, transfer & POS payments", "Instant receipt generation", "Credit sales support"]
  },
  {
    icon: "👥", title: "Know Your Customers",
    desc: "Keep all your customer records in one place.",
    bullets: ["Customer profiles & history", "Track purchase patterns", "Manage customer communications"]
  },
  {
    icon: "📒", title: "Track Who Owes You Money",
    desc: "Never lose track of credit sales or outstanding balances.",
    bullets: ["Log credit sales easily", "See outstanding balances & due dates", "Send payment reminders"]
  },
  {
    icon: "💸", title: "Track Your Spending",
    desc: "Know exactly where your money goes each day.",
    bullets: ["Add expenses by category", "Daily & monthly expense totals", "Keep records organized"]
  },
  {
    icon: "🧾", title: "Professional Invoices",
    desc: "Create and manage invoices for your customers.",
    bullets: ["Generate invoices instantly", "Track invoice status", "Share with customers"]
  },
  {
    icon: "🤖", title: "Ask BizPilot Anything",
    desc: "Get instant answers about your business using plain language — no spreadsheets needed.",
    bullets: ["'How much did I sell today?'", "'What products are low in stock?'", "'Who owes me money?'"]
  },
  {
    icon: "💬", title: "Run Your Business on WhatsApp",
    desc: "Connect your WhatsApp Business number to interact with BizPilot through chat.",
    bullets: ["Ask business questions on WhatsApp", "Record sales via chat", "Get business updates"]
  },
  {
    icon: "⚙️", title: "Set Up Your Business",
    desc: "Configure your business details, manage staff, and control permissions.",
    bullets: ["Owner / Admin / Staff roles", "Subscription & billing", "WhatsApp & integrations"]
  }
];

export default function QuickSetupTour({ businessId, businessName }: QuickSetupTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const storageKey = `bizpilot_tour_completed_${businessId}`;
    const hasCompleted = localStorage.getItem(storageKey);

    if (!hasCompleted) {
      queueMicrotask(() => setIsOpen(true));
    }

    const handleOpen = () => {
      setIsOpen(true);
      setCurrentStep(0);
    };

    window.addEventListener("open-bizpilot-tour", handleOpen);
    return () => window.removeEventListener("open-bizpilot-tour", handleOpen);
  }, [businessId]);

  const finishTour = () => {
    localStorage.setItem(`bizpilot_tour_completed_${businessId}`, "true");
    setIsOpen(false);
    router.push("/dashboard");
  };

  if (!isOpen) return null;

  const isFinishedScreen = currentStep >= steps.length;
  const progressPercent = isFinishedScreen ? 100 : ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#080c1d] rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col">
        {/* Header & Progress */}
        <div className="flex items-center justify-between mb-6">
          {!isFinishedScreen ? (
            <div className="px-3 py-1 bg-slate-100 dark:bg-white/[0.05] rounded-full text-xs font-bold text-slate-600 dark:text-slate-300">
              {currentStep + 1} of {steps.length}
            </div>
          ) : <div />}
          <button onClick={finishTour} className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isFinishedScreen && (
          <div className="w-full h-1 bg-slate-100 dark:bg-white/[0.05] rounded-full mb-8 overflow-hidden">
            <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        {/* Content */}
        {isFinishedScreen ? (
          <div className="text-center py-6 space-y-6">
            <div className="text-6xl">🚀</div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">You're ready to run your business!</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Start by adding your products and customers, then record your first sale.
            </p>
            <div className="flex flex-col gap-3 pt-4">
              <button onClick={finishTour} className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-bold cursor-pointer transition shadow-lg shadow-indigo-500/25">
                Start Using BizPilot
              </button>
              <button onClick={finishTour} className="w-full py-3 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-900 dark:text-white rounded-xl font-bold cursor-pointer transition">
                Explore Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center text-3xl">
              {steps[currentStep].icon}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{steps[currentStep].title}</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                {steps[currentStep].desc}
              </p>
            </div>
            <ul className="space-y-3">
              {steps[currentStep].bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-center gap-3 text-slate-700 dark:text-slate-300 text-sm font-medium">
                  <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs flex-shrink-0">
                    ✓
                  </div>
                  {bullet}
                </li>
              ))}
            </ul>
            
            <div className="flex items-center gap-3 pt-6 mt-6 border-t border-slate-100 dark:border-white/[0.05]">
              {currentStep > 0 ? (
                <button 
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="px-5 py-2.5 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-900 dark:text-white font-bold rounded-xl text-sm transition cursor-pointer"
                >
                  Back
                </button>
              ) : (
                <div className="flex-1" />
              )}
              
              <button 
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition cursor-pointer shadow-md text-center"
              >
                {currentStep === steps.length - 1 ? "Finish Setup" : "Next →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
