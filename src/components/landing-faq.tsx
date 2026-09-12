"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Can my staff use BizPilot?",
    a: "Yes. Role-based permissions let you control exactly what Owners, Admins, and Staff can access and see.",
  },
  {
    q: "Can I use BizPilot on my phone?",
    a: "Yes. BizPilot is fully responsive and works on Android, iPhone, tablets, and desktops.",
  },
  {
    q: "Can I track customers who owe me money?",
    a: "Yes. Credit Sales & Debtors lets you log credit sales, track balances, set due dates, and send payment reminders.",
  },
  {
    q: "Can I record sales through WhatsApp?",
    a: "Yes. Once you connect your WhatsApp Business number, you can log sales and get business updates through WhatsApp.",
  },
  {
    q: "Can I ask BizPilot questions about my business?",
    a: "Yes. The AI Assistant answers questions using your own business data — sales, inventory, customers, expenses, and more.",
  },
  {
    q: "Can I manage my inventory?",
    a: "Yes. Add products, track stock levels, set SKU/barcodes, and get automatic low-stock alerts.",
  },
  {
    q: "Is my business data secure?",
    a: "Yes. Strict multi-tenant isolation ensures your data is completely separate from other businesses. Every login requires a 6-digit email PIN verification.",
  },
  {
    q: "Can multiple staff log in at the same time?",
    a: "Yes. Multiple staff can use BizPilot simultaneously with different permission levels.",
  },
];

export default function LandingFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-12 space-y-3">
      {faqs.map((faq, idx) => {
        const isOpen = openIdx === idx;
        return (
          <div key={idx} className="bg-slate-50 dark:bg-[#090e24]/60 border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden transition-all duration-200">
            <button
              onClick={() => toggle(idx)}
              className="w-full px-6 py-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.02]"
            >
              <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">{faq.q}</span>
              <svg 
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} 
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`px-6 overflow-hidden transition-all duration-200 ease-in-out ${
                isOpen ? "py-4 max-h-40 border-t border-slate-200 dark:border-white/[0.05]" : "max-h-0 py-0"
              }`}
            >
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{faq.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
