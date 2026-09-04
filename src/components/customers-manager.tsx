"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/types/auth";
import { formatMoney } from "@/lib/money";
import { PaymentMethod, CreditStatus, CampaignStatus, RecipientStatus } from "@prisma/client";
import { createCustomerAction, updateCustomerAction, deleteCustomerAction } from "@/lib/actions/customers";
import { recordCreditPaymentAction } from "@/lib/actions/sales";
import DebtorReminderModal from "@/components/debtor-reminder-modal";
import {
  createCampaignAction,
  sendCampaignAction,
  getCampaignsAction,
  getCampaignDetailsAction,
  deleteCampaignAction,
  previewCampaignRecipientsAction,
  CampaignItem,
  CampaignDetailRecipient,
  PreviewRecipientsResult,
} from "@/lib/actions/campaigns";

export interface CustomerCreditSale {
  id: string;
  totalAmount: string;
  amountPaid: string;
  outstandingBalance: string;
  creditStatus: CreditStatus | null;
  creditDueDate: string | null;
  createdAt: string;
  payments: {
    id: string;
    amount: string;
    paymentMethod: PaymentMethod;
    note: string | null;
    createdAt: string;
  }[];
}

export interface CustomerItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  salesCount: number;
  totalSpent: string;
  totalPaid: string;
  outstandingBalance: string;
  creditSalesCount: number;
  overdueAmount: string;
  invoicesCount: number;
  createdAt: string;
  creditSales?: CustomerCreditSale[];
}

interface CustomersManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  customers: CustomerItem[];
  initialCampaigns?: CampaignItem[];
}

export default function CustomersManager({
  business,
  role,
  customers,
  initialCampaigns = [],
}: CustomersManagerProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"DIRECTORY" | "CAMPAIGNS">("DIRECTORY");
  const [searchTerm, setSearchTerm] = useState("");
  const [debtFilter, setDebtFilter] = useState<"ALL" | "WITH_DEBT" | "OVERDUE">("ALL");
  const [isPending, startTransition] = useTransition();

  // Customer Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerItem | null>(null);

  // Quick Repayment from Customer Debt view
  const [repayingSale, setRepayingSale] = useState<{
    saleId: string;
    customerName: string;
    outstandingBalance: string;
  } | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState<string>("");
  const [repaymentMethod, setRepaymentMethod] = useState<PaymentMethod>("CASH");
  const [repaymentNote, setRepaymentNote] = useState<string>("");

  // Debtor Messaging Modal State
  const [remindingDebtor, setRemindingDebtor] = useState<{
    customerId: string;
    customerName: string;
    saleId?: string | null;
  } | null>(null);

  // Campaign State
  const [campaigns, setCampaigns] = useState<CampaignItem[]>(initialCampaigns);
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [campaignStep, setCampaignStep] = useState<"COMPOSE" | "PREVIEW">("COMPOSE");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [recipientMode, setRecipientMode] = useState<"ALL" | "SELECTED">("ALL");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [previewData, setPreviewData] = useState<PreviewRecipientsResult | null>(null);

  // Campaign Details Modal
  const [viewingCampaign, setViewingCampaign] = useState<{
    campaign: CampaignItem;
    recipients: CampaignDetailRecipient[];
  } | null>(null);

  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canManage = role === "OWNER" || role === "ADMIN";

  // Filtered Customers
  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(term) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.toLowerCase().includes(term)) ||
      (c.address && c.address.toLowerCase().includes(term));

    const debtNum = parseFloat(c.outstandingBalance);
    const overdueNum = parseFloat(c.overdueAmount);

    const matchesDebt =
      debtFilter === "ALL" ||
      (debtFilter === "WITH_DEBT" && debtNum > 0) ||
      (debtFilter === "OVERDUE" && overdueNum > 0);

    return matchesSearch && matchesDebt;
  });

  // Aggregated KPIs
  const totalPurchases = customers.reduce((acc, c) => acc + parseFloat(c.totalSpent || "0"), 0);
  const totalReceivables = customers.reduce((acc, c) => acc + parseFloat(c.outstandingBalance || "0"), 0);
  const totalOverdue = customers.reduce((acc, c) => acc + parseFloat(c.overdueAmount || "0"), 0);
  const clientsWithEmailCount = customers.filter((c) => c.email && c.email.trim() !== "").length;

  const totalDeliveredCampaigns = campaigns.reduce((acc, c) => acc + c.sentCount, 0);
  const totalFailedCampaigns = campaigns.reduce((acc, c) => acc + c.failedCount, 0);

  // Handle Customer Form Submit
  const handleCreateCustomer = (formData: FormData) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await createCustomerAction(business.id, formData);

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: "Customer created successfully." });
        setIsCreateOpen(false);
        router.refresh();
      }
    });
  };

  const handleUpdateCustomer = (formData: FormData) => {
    if (!editingCustomer) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await updateCustomerAction(business.id, editingCustomer.id, formData);

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: "Customer updated successfully." });
        setEditingCustomer(null);
        router.refresh();
      }
    });
  };

  const handleDeleteCustomer = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer "${name}"? This action cannot be undone.`)) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteCustomerAction(business.id, id);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: "Customer deleted successfully." });
        router.refresh();
      }
    });
  };

  const handleRecordRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingSale) return;
    setFeedback(null);

    const amountNum = parseFloat(repaymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFeedback({ error: "Please enter a valid repayment amount greater than 0." });
      return;
    }

    startTransition(async () => {
      const res = await recordCreditPaymentAction(business.id, repayingSale.saleId, {
        amount: amountNum,
        paymentMethod: repaymentMethod,
        note: repaymentNote || undefined,
      });

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message || "Payment recorded successfully." });
        setRepayingSale(null);
        setViewingCustomer(null);
        router.refresh();
      }
    });
  };

  // Campaign Handlers
  const handlePreviewRecipients = () => {
    if (!campaignSubject.trim()) {
      setFeedback({ error: "Please enter a campaign subject." });
      return;
    }
    if (!campaignBody.trim()) {
      setFeedback({ error: "Please enter a campaign message." });
      return;
    }

    const targetIds = recipientMode === "SELECTED" ? selectedCustomerIds : undefined;
    if (recipientMode === "SELECTED" && selectedCustomerIds.length === 0) {
      setFeedback({ error: "Please select at least one customer recipient." });
      return;
    }

    startTransition(async () => {
      const res = await previewCampaignRecipientsAction(business.id, targetIds);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setPreviewData(res);
        setCampaignStep("PREVIEW");
      }
    });
  };

  const handleSaveDraft = () => {
    startTransition(async () => {
      const targetIds = recipientMode === "SELECTED" ? selectedCustomerIds : undefined;
      const res = await createCampaignAction(business.id, {
        subject: campaignSubject,
        body: campaignBody,
        customerIds: targetIds,
      });

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: "Campaign saved as draft." });
        setIsCreateCampaignOpen(false);
        resetCampaignForm();
        reloadCampaigns();
      }
    });
  };

  const handleSendCampaign = async (campaignId?: string) => {
    setFeedback(null);
    startTransition(async () => {
      let targetCampaignId = campaignId;

      // If no campaignId provided, create a draft first
      if (!targetCampaignId) {
        const targetIds = recipientMode === "SELECTED" ? selectedCustomerIds : undefined;
        const createRes = await createCampaignAction(business.id, {
          subject: campaignSubject,
          body: campaignBody,
          customerIds: targetIds,
        });

        if (createRes.error || !createRes.campaignId) {
          setFeedback({ error: createRes.error || "Failed to initiate campaign." });
          return;
        }
        targetCampaignId = createRes.campaignId;
      }

      const targetIds = recipientMode === "SELECTED" ? selectedCustomerIds : undefined;
      const sendRes = await sendCampaignAction(business.id, targetCampaignId, targetIds);

      if (sendRes.error) {
        setFeedback({ error: sendRes.error });
      } else {
        setFeedback({
          message: `Campaign dispatched: ${sendRes.sentCount} sent, ${sendRes.failedCount} failed (${sendRes.status}).`,
        });
        setIsCreateCampaignOpen(false);
        resetCampaignForm();
        reloadCampaigns();
      }
    });
  };

  const reloadCampaigns = async () => {
    const res = await getCampaignsAction(business.id);
    if (res.success) {
      setCampaigns(res.campaigns);
    }
  };

  const handleViewCampaignDetails = async (campaignId: string) => {
    startTransition(async () => {
      const res = await getCampaignDetailsAction(business.id, campaignId);
      if (res.success && res.campaign && res.recipients) {
        setViewingCampaign({
          campaign: res.campaign,
          recipients: res.recipients,
        });
      } else {
        setFeedback({ error: res.error || "Failed to load campaign details." });
      }
    });
  };

  const handleDeleteDraft = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this draft campaign?")) return;
    startTransition(async () => {
      const res = await deleteCampaignAction(business.id, campaignId);
      if (res.success) {
        setFeedback({ message: "Draft deleted." });
        reloadCampaigns();
      } else {
        setFeedback({ error: res.error });
      }
    });
  };

  const resetCampaignForm = () => {
    setCampaignStep("COMPOSE");
    setCampaignSubject("");
    setCampaignBody("");
    setRecipientMode("ALL");
    setSelectedCustomerIds([]);
    setPreviewData(null);
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 uppercase tracking-wide">
              Client CRM & Communications
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{customers.length} Accounts Registered</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Customer Directory & Announcements
          </h1>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
            Manage client profiles, debt tracking ledgers, and targeted email broadcasts
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === "DIRECTORY" ? (
            <button
              onClick={() => {
                setFeedback(null);
                setIsCreateOpen(true);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 via-indigo-600 to-violet-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/25 dark:shadow-[0_0_25px_-5px_rgba(6,182,212,0.5)] transition-all flex items-center gap-2 cursor-pointer border border-cyan-400/30"
            >
              <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add New Customer</span>
            </button>
          ) : (
            canManage && (
              <button
                onClick={() => {
                  setFeedback(null);
                  resetCampaignForm();
                  setIsCreateCampaignOpen(true);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-5px_rgba(139,92,246,0.5)] transition-all flex items-center gap-2 cursor-pointer border border-violet-400/30"
              >
                <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span>New Email Campaign</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-[#090e24]/70 border border-slate-200 dark:border-white/[0.08] rounded-2xl w-fit backdrop-blur-xl">
        <button
          onClick={() => setActiveTab("DIRECTORY")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === "DIRECTORY"
              ? "bg-white dark:bg-gradient-to-r dark:from-cyan-500/20 dark:to-indigo-500/20 text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-cyan-500/40 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <span>👥</span>
          <span>Directory & Debt Ledger</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 font-mono">
            {customers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("CAMPAIGNS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === "CAMPAIGNS"
              ? "bg-white dark:bg-gradient-to-r dark:from-violet-500/20 dark:to-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-slate-200 dark:border-violet-500/40 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <span>📢</span>
          <span>Email Announcements</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 font-mono">
            {campaigns.length}
          </span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium transition-all flex items-center justify-between shadow-md ${
            feedback.error
              ? "bg-rose-50 dark:bg-rose-950/20 border-rose-500/30 text-rose-800 dark:text-rose-300"
              : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <span>{feedback.error ? "⚠️" : "✅"}</span>
            <span>{feedback.error || feedback.message}</span>
          </span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 1: CLIENT DIRECTORY & DEBT LEDGER
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "DIRECTORY" && (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Total Clients</span>
              <span className="text-xl font-black text-slate-900 dark:text-white font-mono">{customers.length}</span>
            </div>

            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Total Customer Spend</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {formatMoney(totalPurchases, business.currency)}
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl backdrop-blur-xl space-y-1 shadow-md border ${
                totalReceivables > 0
                  ? "bg-amber-50/80 dark:bg-amber-950/20 border-amber-500/40"
                  : "bg-white/90 dark:bg-[#090e24]/70 border-slate-200/90 dark:border-white/[0.08]"
              }`}
            >
              <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wider block">Outstanding Credit Debt</span>
              <span className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">
                {formatMoney(totalReceivables, business.currency)}
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl backdrop-blur-xl space-y-1 shadow-md border ${
                totalOverdue > 0
                  ? "bg-rose-50/80 dark:bg-rose-950/25 border-rose-500/40 animate-pulse"
                  : "bg-white/90 dark:bg-[#090e24]/70 border-slate-200/90 dark:border-white/[0.08]"
              }`}
            >
              <span className="text-[10px] text-rose-700 dark:text-rose-300 font-bold uppercase tracking-wider block">Overdue Debt</span>
              <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                {formatMoney(totalOverdue, business.currency)}
              </span>
            </div>
          </div>

          {/* Search & Debt Filter Bar */}
          <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 backdrop-blur-xl shadow-md">
            <div className="relative flex-1">
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search customers by name, phone number, email, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#060a1a] rounded-xl border border-slate-200 dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setDebtFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  debtFilter === "ALL" ? "bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white shadow-xs" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                All ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter("WITH_DEBT")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  debtFilter === "WITH_DEBT"
                    ? "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-300"
                }`}
              >
                With Debt ({customers.filter((c) => parseFloat(c.outstandingBalance) > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setDebtFilter("OVERDUE")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  debtFilter === "OVERDUE"
                    ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300"
                }`}
              >
                Overdue ({customers.filter((c) => parseFloat(c.overdueAmount) > 0).length})
              </button>
            </div>
          </div>

          {/* Customers Table */}
          <div className="bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-md dark:shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-[#060919] text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-white/[0.08]">
                  <tr>
                    <th className="py-3.5 px-4">Client Name & Details</th>
                    <th className="py-3.5 px-4">Contact Information</th>
                    <th className="py-3.5 px-4 text-right">Lifetime Spend</th>
                    <th className="py-3.5 px-4 text-right">Credit Debt</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        No customers found matching the search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => {
                      const debtNum = parseFloat(c.outstandingBalance);
                      const overdueNum = parseFloat(c.overdueAmount);

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600/20 to-indigo-600/20 dark:from-cyan-600/30 dark:to-indigo-600/30 border border-cyan-500/30 flex items-center justify-center font-bold text-cyan-700 dark:text-cyan-200 uppercase text-xs shrink-0">
                                {c.name.slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-slate-900 dark:text-white block truncate">{c.name}</span>
                                {c.address && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">{c.address}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            {c.email ? (
                              <span className="text-cyan-600 dark:text-cyan-300 block">{c.email}</span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 block">No email</span>
                            )}
                            {c.phone && <span className="text-slate-500 dark:text-slate-400 block text-[10px]">{c.phone}</span>}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(parseFloat(c.totalSpent), business.currency)}
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                              {c.salesCount} orders
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono">
                            {debtNum > 0 ? (
                              <div>
                                <span className="font-bold text-amber-600 dark:text-amber-300">
                                  {formatMoney(debtNum, business.currency)}
                                </span>
                                {overdueNum > 0 && (
                                  <span className="text-[10px] text-rose-600 dark:text-rose-400 block font-semibold animate-pulse">
                                    ⚠️ {formatMoney(overdueNum, business.currency)} overdue
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">₦0.00</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {overdueNum > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                OVERDUE
                              </span>
                            ) : debtNum > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                ACTIVE DEBT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                SETTLED
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {debtNum > 0 && (
                                <button
                                  onClick={() =>
                                    setRemindingDebtor({
                                      customerId: c.id,
                                      customerName: c.name,
                                    })
                                  }
                                  title={`Send Payment Reminder to ${c.name}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  <span>💬</span>
                                  <span>Remind</span>
                                </button>
                              )}
                              <button
                                onClick={() => setViewingCustomer(c)}
                                title="View Customer Profile & Debt Ledger"
                                className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 text-xs font-semibold transition cursor-pointer"
                              >
                                Ledger
                              </button>
                              <button
                                onClick={() => setEditingCustomer(c)}
                                title="Edit Customer"
                                aria-label={`Edit ${c.name}`}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                              >
                                ✏️
                              </button>
                              {canManage && (
                                <button
                                  onClick={() => handleDeleteCustomer(c.id, c.name)}
                                  title="Delete Customer"
                                  aria-label={`Delete ${c.name}`}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition cursor-pointer"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          TAB 2: EMAIL ANNOUNCEMENTS & CAMPAIGNS
          ──────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CAMPAIGNS" && (
        <div className="space-y-6">
          {/* Campaign KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Total Campaigns</span>
              <span className="text-xl font-black text-slate-900 dark:text-white font-mono">{campaigns.length}</span>
            </div>

            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Reachable Clients (Email)</span>
              <span className="text-xl font-black text-cyan-600 dark:text-cyan-300 font-mono">{clientsWithEmailCount}</span>
            </div>

            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Emails Delivered</span>
              <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{totalDeliveredCampaigns}</span>
            </div>

            <div className="p-4 bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-2xl backdrop-blur-xl space-y-1 shadow-md">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">Failed Dispatches</span>
              <span className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">{totalFailedCampaigns}</span>
            </div>
          </div>

          {/* Campaigns History Table */}
          <div className="bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-md dark:shadow-xl">
            <div className="p-4 bg-slate-50 dark:bg-[#060919] border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Broadcast History</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">({campaigns.length} total)</span>
              </div>
              {canManage && (
                <button
                  onClick={() => {
                    setFeedback(null);
                    resetCampaignForm();
                    setIsCreateCampaignOpen(true);
                  }}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>+ New Broadcast</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-[#060919] text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-white/[0.08]">
                  <tr>
                    <th className="py-3.5 px-4">Subject & Content</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-right">Delivery Metrics</th>
                    <th className="py-3.5 px-4">Created / Sent At</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        <p className="font-semibold text-slate-900 dark:text-white">No email campaigns created yet.</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Create an announcement to notify your customers of price updates, holidays, or promotions.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((c) => {
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition">
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900 dark:text-white leading-snug">{c.subject}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-xs">{c.body}</p>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">By {c.createdBy}</span>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {c.status === "SENT" && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                SENT
                              </span>
                            )}
                            {c.status === "PARTIALLY_SENT" && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                PARTIAL
                              </span>
                            )}
                            {c.status === "SENDING" && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 animate-pulse">
                                SENDING...
                              </span>
                            )}
                            {c.status === "DRAFT" && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-500/30">
                                DRAFT
                              </span>
                            )}
                            {c.status === "FAILED" && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                                FAILED
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono">
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {c.sentCount} / {c.recipientCount} sent
                            </span>
                            {c.failedCount > 0 && (
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 block">
                                {c.failedCount} failed
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {c.sentAt ? (
                              <div>
                                <span className="text-slate-900 dark:text-white block">{new Date(c.sentAt).toLocaleDateString()}</span>
                                <span className="text-[10px]">{new Date(c.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-slate-500 dark:text-slate-400 block">{new Date(c.createdAt).toLocaleDateString()}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">(Draft)</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {c.status === "DRAFT" && canManage && (
                                <>
                                  <button
                                    onClick={() => handleSendCampaign(c.id)}
                                    disabled={isPending}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold transition cursor-pointer"
                                  >
                                    Send
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDraft(c.id)}
                                    disabled={isPending}
                                    aria-label="Delete draft"
                                    className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 transition cursor-pointer"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleViewCampaignDetails(c.id)}
                                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 text-xs font-semibold transition cursor-pointer"
                              >
                                Delivery Log
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: CREATE / PREVIEW / CONFIRM EMAIL CAMPAIGN
          ──────────────────────────────────────────────────────────────────────── */}
      {isCreateCampaignOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-violet-500/30 rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-4">
              <div>
                <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider block">
                  {campaignStep === "COMPOSE" ? "Step 1: Compose Message" : "Step 2: Recipient Preview & Confirm"}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {campaignStep === "COMPOSE" ? "Create Customer Announcement" : "Review & Dispatch Broadcast"}
                </h3>
              </div>
              <button
                onClick={() => setIsCreateCampaignOpen(false)}
                aria-label="Close modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {campaignStep === "COMPOSE" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="campaign-subject-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Campaign Subject / Headline *
                  </label>
                  <input
                    id="campaign-subject-input"
                    type="text"
                    required
                    placeholder="e.g. Holiday Trading Hours & Special Price Reductions"
                    value={campaignSubject}
                    onChange={(e) => setCampaignSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-xs"
                  />
                </div>

                <div>
                  <label htmlFor="campaign-body-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Announcement Message (Text Body) *
                  </label>
                  <textarea
                    id="campaign-body-input"
                    rows={5}
                    required
                    placeholder="Write your customer announcement here... Paragraph breaks will be formatted cleanly in the email template."
                    value={campaignBody}
                    onChange={(e) => setCampaignBody(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 leading-relaxed shadow-xs"
                  />
                </div>

                {/* Target Audience Selector */}
                <div className="space-y-2">
                  <span className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Target Recipient Audience
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecipientMode("ALL")}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        recipientMode === "ALL"
                          ? "bg-violet-50 dark:bg-violet-500/15 border-violet-500/40 text-violet-900 dark:text-white shadow-xs"
                          : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <span className="font-bold text-xs block">All Clients with Email</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {clientsWithEmailCount} eligible accounts
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecipientMode("SELECTED")}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        recipientMode === "SELECTED"
                          ? "bg-violet-50 dark:bg-violet-500/15 border-violet-500/40 text-violet-900 dark:text-white shadow-xs"
                          : "bg-slate-50 dark:bg-[#050816] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <span className="font-bold text-xs block">Select Specific Clients</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {selectedCustomerIds.length} selected
                      </span>
                    </button>
                  </div>
                </div>

                {/* Specific Customer Multi-Select Picker */}
                {recipientMode === "SELECTED" && (
                  <div className="p-3 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-xl space-y-2 max-h-40 overflow-y-auto shadow-xs">
                    <input
                      type="text"
                      placeholder="Filter clients to select..."
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      aria-label="Filter clients"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-[#080c1d] border border-slate-300 dark:border-white/[0.08] rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 mb-2 focus:outline-none"
                    />
                    <div className="space-y-1">
                      {customers
                        .filter((c) => c.name.toLowerCase().includes(recipientSearch.toLowerCase()) || (c.email && c.email.toLowerCase().includes(recipientSearch.toLowerCase())))
                        .map((c) => {
                          const isChecked = selectedCustomerIds.includes(c.id);
                          const hasEmail = c.email && c.email.trim() !== "";

                          return (
                            <label
                              key={c.id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs ${
                                isChecked ? "bg-violet-100 dark:bg-violet-950/40" : "hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCustomerIds([...selectedCustomerIds, c.id]);
                                    } else {
                                      setSelectedCustomerIds(selectedCustomerIds.filter((id) => id !== c.id));
                                    }
                                  }}
                                  className="accent-violet-500 rounded"
                                />
                                <span className="font-semibold text-slate-900 dark:text-white">{c.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                {hasEmail ? c.email : "(No Email)"}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsCreateCampaignOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewRecipients}
                    disabled={isPending}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-violet-600/20"
                  >
                    {isPending ? "Evaluating Recipients..." : "Preview Recipients →"}
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: RECIPIENT PREVIEW & CONFIRMATION */
              <div className="space-y-4">
                {previewData && (
                  <div className="space-y-3">
                    {/* Breakdown KPI Card */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Targeted</span>
                        <span className="text-base font-black text-slate-900 dark:text-white font-mono">{previewData.totalTargeted}</span>
                      </div>
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase block">Eligible</span>
                        <span className="text-base font-black text-emerald-600 dark:text-emerald-300 font-mono">
                          {previewData.eligibleCount}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Skipped</span>
                        <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">{previewData.skippedCount}</span>
                      </div>
                    </div>

                    {previewData.skippedCount > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <span className="font-bold block">Skipped Recipient Reasons:</span>
                        <ul className="list-disc list-inside text-[11px] text-amber-700 dark:text-amber-200 space-y-0.5">
                          {previewData.skippedBreakdown.noEmail > 0 && (
                            <li>{previewData.skippedBreakdown.noEmail} customers with missing/empty email</li>
                          )}
                          {previewData.skippedBreakdown.invalidEmail > 0 && (
                            <li>{previewData.skippedBreakdown.invalidEmail} customers with invalid email format</li>
                          )}
                          {previewData.skippedBreakdown.duplicateEmail > 0 && (
                            <li>{previewData.skippedBreakdown.duplicateEmail} duplicate email addresses filtered</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Preview Sample List */}
                    <div className="p-3 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-xl space-y-1.5 max-h-36 overflow-y-auto">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
                        Eligible Customer Recipients:
                      </span>
                      {previewData.recipients.map((r) => (
                        <div key={r.customerId} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-900 dark:text-white font-medium">{r.name}</span>
                          <span className="text-cyan-600 dark:text-cyan-300 font-mono">{r.email}</span>
                        </div>
                      ))}
                    </div>

                    {/* Message Preview Box */}
                    <div className="p-3 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
                        Subject: <strong className="text-slate-900 dark:text-white">{campaignSubject}</strong>
                      </span>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-3 italic">&quot;{campaignBody}&quot;</p>
                    </div>

                    <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-500/30 text-xs text-violet-800 dark:text-violet-200">
                      ⚡ <strong>Confirmation Notice:</strong> You are about to send this campaign to{" "}
                      <strong>{previewData.eligibleCount} customers</strong>. This action will dispatch emails immediately via Resend.
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setCampaignStep("COMPOSE")}
                    className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs font-semibold cursor-pointer"
                  >
                    ← Edit Content
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={isPending}
                      className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendCampaign()}
                      disabled={isPending || !previewData || previewData.eligibleCount === 0}
                      className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-950/20"
                    >
                      {isPending ? "Sending Campaign..." : "Send Campaign Now 🚀"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODAL: CAMPAIGN DELIVERY LOG & RECIPIENT AUDIT
          ──────────────────────────────────────────────────────────────────────── */}
      {viewingCampaign && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-cyan-500/30 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-4">
              <div>
                <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider block">
                  Delivery Log Snapshot
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{viewingCampaign.campaign.subject}</h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Created by {viewingCampaign.campaign.createdBy} on{" "}
                  {new Date(viewingCampaign.campaign.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setViewingCampaign(null)}
                aria-label="Close log"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Campaign Summary & Body */}
            <div className="p-3.5 bg-slate-50 dark:bg-[#050816] rounded-2xl border border-slate-200 dark:border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500 dark:text-slate-400">Status: <strong className="text-slate-900 dark:text-white">{viewingCampaign.campaign.status}</strong></span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{viewingCampaign.campaign.sentCount} sent</span>
                {viewingCampaign.campaign.failedCount > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">{viewingCampaign.campaign.failedCount} failed</span>
                )}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed border-t border-slate-200 dark:border-white/[0.06] pt-2">
                {viewingCampaign.campaign.body}
              </p>
            </div>

            {/* Recipients List Table */}
            <div className="space-y-2">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">
                Recipient Delivery Status ({viewingCampaign.recipients.length} recipients)
              </span>
              <div className="bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-100 dark:bg-[#080c1d] text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold border-b border-slate-200 dark:border-white/[0.08]">
                    <tr>
                      <th className="py-2.5 px-3">Customer / Email</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-white/[0.04]">
                    {viewingCampaign.recipients.map((r) => (
                      <tr key={r.id} className="hover:bg-white dark:hover:bg-white/[0.02]">
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900 dark:text-white block text-[11px]">{r.customerName}</span>
                          <span className="text-[10px] text-cyan-600 dark:text-cyan-300 font-mono">{r.email}</span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {r.status === "SENT" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              SENT
                            </span>
                          )}
                          {r.status === "FAILED" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                              FAILED
                            </span>
                          )}
                          {r.status === "PENDING" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              PENDING
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : r.errorMessage || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setViewingCampaign(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          MODALS: CUSTOMER CREATE / EDIT / LEDGER / REPAYMENT
          ──────────────────────────────────────────────────────────────────────── */}
      {/* Customer Detail & Debt Ledger Modal */}
      {viewingCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-cyan-500/30 rounded-3xl p-6 sm:p-7 max-w-2xl w-full shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-violet-600 p-[1.5px] shadow-sm">
                  <div className="w-full h-full bg-slate-900 dark:bg-[#080c1d] rounded-[14px] flex items-center justify-center font-bold text-white uppercase text-sm">
                    {viewingCustomer.name.slice(0, 2)}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{viewingCustomer.name}</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {viewingCustomer.email || "No email"} • {viewingCustomer.phone || "No phone"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingCustomer(null)}
                aria-label="Close ledger modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Customer Summary Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Total Purchases</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatMoney(parseFloat(viewingCustomer.totalSpent), business.currency)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.08]">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">Total Paid</span>
                <span className="text-sm font-black text-cyan-600 dark:text-cyan-300 font-mono">
                  {formatMoney(parseFloat(viewingCustomer.totalPaid), business.currency)}
                </span>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-500/30">
                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold uppercase block">Outstanding Debt</span>
                <span className="text-sm font-black text-amber-600 dark:text-amber-400 font-mono">
                  {formatMoney(parseFloat(viewingCustomer.outstandingBalance), business.currency)}
                </span>
              </div>
            </div>

            {/* Debtor Reminder Action Banner */}
            {parseFloat(viewingCustomer.outstandingBalance) > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-cyan-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">
                      Payment Notice & WhatsApp Reminder
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Send a friendly or overdue balance notification via WhatsApp or Email
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRemindingDebtor({
                      customerId: viewingCustomer.id,
                      customerName: viewingCustomer.name,
                    })
                  }
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <span>💬</span>
                  <span>Send Payment Reminder</span>
                </button>
              </div>
            )}

            {/* Debt Sales Ledger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Credit Sales & Repayment Timeline
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {viewingCustomer.creditSales?.length || 0} credit sale(s)
                </span>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {(!viewingCustomer.creditSales || viewingCustomer.creditSales.length === 0) ? (
                  <div className="p-6 bg-slate-50 dark:bg-[#050816] rounded-xl text-center text-slate-500 dark:text-slate-400 text-xs">
                    No credit transactions on record for this customer.
                  </div>
                ) : (
                  viewingCustomer.creditSales.map((s) => {
                    const bal = parseFloat(s.outstandingBalance);

                    return (
                      <div
                        key={s.id}
                        className="p-3.5 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-xl space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              Sale of {formatMoney(parseFloat(s.totalAmount), business.currency)}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                              Date: {new Date(s.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {s.creditStatus === "PAID" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                SETTLED
                              </span>
                            )}
                            {s.creditStatus === "PARTIALLY_PAID" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                                PARTIAL
                              </span>
                            )}
                            {s.creditStatus === "UNPAID" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                UNPAID
                              </span>
                            )}
                            {s.creditStatus === "OVERDUE" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 animate-pulse">
                                OVERDUE
                              </span>
                            )}

                            {bal > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRemindingDebtor({
                                      customerId: viewingCustomer.id,
                                      customerName: viewingCustomer.name,
                                      saleId: s.id,
                                    })
                                  }
                                  title="Send reminder for this specific credit sale"
                                  className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                                >
                                  <span>💬</span>
                                  <span>Remind</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRepayingSale({
                                      saleId: s.id,
                                      customerName: viewingCustomer.name,
                                      outstandingBalance: s.outstandingBalance,
                                    })
                                  }
                                  className="px-2.5 py-1 bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 rounded-lg text-xs font-bold transition cursor-pointer"
                                >
                                  Repay
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Balance progress */}
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400">
                            Paid: <strong className="text-emerald-600 dark:text-emerald-400">{formatMoney(parseFloat(s.amountPaid), business.currency)}</strong>
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Balance: <strong className="text-amber-600 dark:text-amber-400">{formatMoney(bal, business.currency)}</strong>
                          </span>
                        </div>

                        {/* Installment payments list */}
                        {s.payments.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-white/[0.04] space-y-1">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
                              Installment Payment History:
                            </span>
                            {s.payments.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.02] p-1.5 rounded-lg"
                              >
                                <span>
                                  {new Date(p.createdAt).toLocaleDateString()} • {p.paymentMethod}
                                </span>
                                <span className="text-emerald-600 dark:text-emerald-300 font-bold">
                                  +{formatMoney(parseFloat(p.amount), business.currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Repayment Modal */}
      {repayingSale && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Debt Settlement
                </span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Record Credit Repayment</h3>
              </div>
              <button
                onClick={() => setRepayingSale(null)}
                aria-label="Close modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordRepayment} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.08] space-y-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Customer: <strong className="text-slate-900 dark:text-white">{repayingSale.customerName}</strong></span>
                <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 block">
                  Outstanding Balance: {formatMoney(parseFloat(repayingSale.outstandingBalance), business.currency)}
                </span>
              </div>

              <div>
                <label htmlFor="repayment-amount-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Repayment Amount ({business.currency}) *
                </label>
                <input
                  id="repayment-amount-input"
                  type="number"
                  step="0.01"
                  required
                  max={repayingSale.outstandingBalance}
                  placeholder="e.g. 5000"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-amber-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="repayment-method-select" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  id="repayment-method-select"
                  value={repaymentMethod}
                  onChange={(e) => setRepaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-amber-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                >
                  <option value="CASH">Cash</option>
                  <option value="TRANSFER">Bank Transfer</option>
                  <option value="CARD">Debit Card (POS)</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label htmlFor="repayment-notes-input" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Notes (Optional)
                </label>
                <input
                  id="repayment-notes-input"
                  type="text"
                  placeholder="e.g. Bank transfer reference #84930"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-amber-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setRepayingSale(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-amber-950/20"
                >
                  {isPending ? "Processing..." : "Confirm Repayment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-cyan-500/30 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Add New Customer</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form action={handleCreateCustomer} className="space-y-4">
              <div>
                <label htmlFor="create-customer-name" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Customer Full Name *
                </label>
                <input
                  id="create-customer-name"
                  name="name"
                  required
                  placeholder="e.g. John Doe / Starlight Stores"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="create-customer-phone" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  id="create-customer-phone"
                  name="phone"
                  placeholder="+234..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="create-customer-email" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  id="create-customer-email"
                  name="email"
                  type="email"
                  placeholder="client@example.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="create-customer-address" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Delivery / Physical Address
                </label>
                <textarea
                  id="create-customer-address"
                  name="address"
                  rows={2}
                  placeholder="123 Broad Street, Lagos"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 via-indigo-600 to-violet-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-cyan-950/20"
                >
                  {isPending ? "Creating..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#090e24] border border-slate-200 dark:border-cyan-500/30 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Edit Customer Profile</h3>
              <button
                onClick={() => setEditingCustomer(null)}
                aria-label="Close modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form action={handleUpdateCustomer} className="space-y-4">
              <div>
                <label htmlFor="edit-customer-name" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Customer Full Name *
                </label>
                <input
                  id="edit-customer-name"
                  name="name"
                  required
                  defaultValue={editingCustomer.name}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-customer-phone" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  id="edit-customer-phone"
                  name="phone"
                  defaultValue={editingCustomer.phone || ""}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-customer-email" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  id="edit-customer-email"
                  name="email"
                  type="email"
                  defaultValue={editingCustomer.email || ""}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-customer-address" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Delivery / Physical Address
                </label>
                <textarea
                  id="edit-customer-address"
                  name="address"
                  rows={2}
                  defaultValue={editingCustomer.address || ""}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 via-indigo-600 to-violet-600 hover:from-cyan-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-cyan-950/20"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Debtor Reminder & WhatsApp Modal */}
      {remindingDebtor && (
        <DebtorReminderModal
          businessId={business.id}
          currency={business.currency}
          customerId={remindingDebtor.customerId}
          customerName={remindingDebtor.customerName}
          saleId={remindingDebtor.saleId}
          isOpen={Boolean(remindingDebtor)}
          onClose={() => setRemindingDebtor(null)}
          onSuccess={(msg) => {
            setFeedback({ message: msg });
            setRemindingDebtor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

