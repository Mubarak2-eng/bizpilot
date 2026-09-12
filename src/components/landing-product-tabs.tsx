"use client";

import { useState } from "react";

const tabs = [
  {
    id: "pos",
    title: "⚡ POS & Sales",
    description: "Fast sales recording, multiple payment methods, and instant receipts.",
    bullets: ["Cash, Bank Transfer, POS Terminal", "Instant PDF/WhatsApp Receipts", "Credit sales tracking"],
  },
  {
    id: "inventory",
    title: "📦 Inventory",
    description: "Keep your inventory accurate and always know what's in stock.",
    bullets: ["Stock quantities tracking", "SKU and barcode support", "Low-stock alerts & reorder thresholds"],
  },
  {
    id: "customers",
    title: "👥 Customers",
    description: "Keep all your customer records in one place and track purchase history.",
    bullets: ["Customer profiles & history", "Credit and debt tracking", "Targeted customer communications"],
  },
  {
    id: "ai",
    title: "🤖 AI Assistant",
    description: "Ask questions about business data in plain language.",
    bullets: ["'How much did I sell today?'", "'What products are low in stock?'", "'Who owes me money?'"],
  },
  {
    id: "whatsapp",
    title: "💬 WhatsApp",
    description: "Connect WhatsApp to interact with your business through chat.",
    bullets: ["Record sales via chat", "Ask business questions on WhatsApp", "Get business updates instantly"],
  },
];

export default function LandingProductTabs() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  const activeContent = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <div className="w-full max-w-5xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6 md:gap-10">
      <div className="flex flex-row md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap px-4 py-3 rounded-xl text-sm font-bold text-left transition-all duration-200 cursor-pointer flex-shrink-0 ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20"
                : "bg-slate-100 dark:bg-[#090e24]/40 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[#090e24]/80"
            }`}
          >
            {tab.title}
          </button>
        ))}
      </div>
      
      <div className="bg-[#090e24]/80 border border-white/[0.08] rounded-2xl p-6 sm:p-10 backdrop-blur-xl relative overflow-hidden min-h-[300px] flex flex-col justify-center">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-violet-600/10 blur-3xl rounded-full pointer-events-none" />
        <h3 className="text-2xl font-black text-white mb-4">{activeContent.title}</h3>
        <p className="text-slate-300 mb-6 text-base">{activeContent.description}</p>
        <ul className="space-y-3">
          {activeContent.bullets.map((bullet, idx) => (
            <li key={idx} className="flex items-center gap-3 text-slate-400 text-sm">
              <div className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center flex-shrink-0 text-xs">
                ✓
              </div>
              {bullet}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
