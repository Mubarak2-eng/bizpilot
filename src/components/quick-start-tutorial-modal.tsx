"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TutorialVideoPlayer from "./tutorial-video-player";

interface QuickStartTutorialModalProps {
  businessId: string;
  businessName: string;
  videoUrl?: string;
}

export function openQuickStartTutorial() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-bizpilot-tutorial"));
  }
}

export default function QuickStartTutorialModal({
  businessId,
  businessName,
  videoUrl = "https://youtu.be/NuYGXklSpfY",
}: QuickStartTutorialModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"VIDEO" | "STEPS">("VIDEO");

  useEffect(() => {
    // Check if user has already seen the tutorial for this business workspace
    const storageKey = `bizpilot_tutorial_completed_${businessId}`;
    const hasCompleted = localStorage.getItem(storageKey);

    if (!hasCompleted) {
      // First-time login: automatically pop up the welcome tutorial modal
      setIsOpen(true);
    }

    // Listen for manual rewatch triggers from dashboard header buttons
    const handleOpenEvent = () => {
      setIsOpen(true);
      setActiveTab("VIDEO");
    };

    window.addEventListener("open-bizpilot-tutorial", handleOpenEvent);
    return () => {
      window.removeEventListener("open-bizpilot-tutorial", handleOpenEvent);
    };
  }, [businessId]);

  const handleDismiss = () => {
    // Persist completion flag so returning logins land straight on the dashboard
    localStorage.setItem(`bizpilot_tutorial_completed_${businessId}`, "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#070a1e] border border-slate-200 dark:border-violet-500/30 rounded-3xl p-5 sm:p-8 shadow-2xl shadow-violet-950/50 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/[0.08]">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-700 dark:text-violet-300 text-[11px] font-bold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Quick Start Onboarding
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Welcome to BizPilot AI, <span className="gradient-text-ai">{businessName}</span>! 🎉
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              Get up and running with automated WhatsApp sales, inventory tracking, and AI operations.
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] transition cursor-pointer"
            title="Close Tutorial"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 pt-4 pb-2">
          <button
            onClick={() => setActiveTab("VIDEO")}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "VIDEO"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            🎥 Video Walkthrough (7 min)
          </button>
          <button
            onClick={() => setActiveTab("STEPS")}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
              activeTab === "STEPS"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            ⚡ 3 Quick Wins
          </button>
        </div>

        {/* Body Content */}
        <div className="py-3 flex-1">
          {activeTab === "VIDEO" ? (
            <div className="space-y-4">
              <TutorialVideoPlayer
                videoUrl={videoUrl}
                title="Run Your Entire Business on WhatsApp Autopilot"
                subtitle="Watch how BizPilot records sales via voice note, alerts you before inventory runs low, and recovers debtor payments automatically."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 py-2">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-sm flex items-center justify-center">
                    1
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Record 1st Sale</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Log a quick cash, bank transfer, or credit sale and test instant receipt creation.
                  </p>
                </div>
                <Link
                  href="/sales"
                  onClick={handleDismiss}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                >
                  Record Sale →
                </Link>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black text-sm flex items-center justify-center">
                    2
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Add 1st Product</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Add your inventory items and stock thresholds to get real-time low-stock alerts.
                  </p>
                </div>
                <Link
                  href="/products"
                  onClick={handleDismiss}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                >
                  Add Products →
                </Link>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-black text-sm flex items-center justify-center">
                    3
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Try AI Copilot</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Ask BizPilot AI anything: &quot;What are my top selling items?&quot; or &quot;Generate invoice for John&quot;.
                  </p>
                </div>
                <Link
                  href="/assistant"
                  onClick={handleDismiss}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition"
                >
                  Open AI Copilot →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/[0.08] mt-2">
          {activeTab === "VIDEO" ? (
            <button
              onClick={() => setActiveTab("STEPS")}
              className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
            >
              Skip to 3 Quick Wins 👉
            </button>
          ) : (
            <button
              onClick={() => setActiveTab("VIDEO")}
              className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
            >
              👈 Back to Video Tour
            </button>
          )}

          <button
            onClick={handleDismiss}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            🚀 Launch My Business Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}