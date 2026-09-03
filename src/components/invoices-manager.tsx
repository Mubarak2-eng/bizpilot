"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { InvoiceStatus } from "@prisma/client";
import { createInvoiceAction, updateInvoiceStatusAction, deleteInvoiceAction } from "@/lib/actions/invoices";

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: string;
  tax: string;
  total: string;
  dueDate: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
  }[];
}

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sellingPrice: string;
}

interface InvoicesManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  invoices: InvoiceRecord[];
  customers: CustomerOption[];
  products: CatalogProduct[];
}

export default function InvoicesManager({
  business,
  role,
  invoices,
  customers,
  products,
}: InvoicesManagerProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Create Invoice Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customInvoiceNumber, setCustomInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [taxPercent, setTaxPercent] = useState<number>(7.5);
  const [lineItems, setLineItems] = useState<
    { description: string; quantity: number; unitPrice: number; productId?: string }[]
  >([{ description: "", quantity: 1, unitPrice: 0 }]);

  // Detail / Printable Preview State
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRecord | null>(null);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canDelete = role === "OWNER" || role === "ADMIN";

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate live numbers
  const subtotalNum = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const taxNum = (subtotalNum * (taxPercent || 0)) / 100;
  const grandTotalNum = subtotalNum + taxNum;

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    const updated = [...lineItems];
    updated.splice(index, 1);
    setLineItems(updated);
  };

  const handleLineItemChange = (
    index: number,
    field: "description" | "quantity" | "unitPrice",
    value: string | number
  ) => {
    const updated = [...lineItems];
    if (field === "quantity") {
      updated[index].quantity = Math.max(1, parseInt(String(value), 10) || 1);
    } else if (field === "unitPrice") {
      updated[index].unitPrice = Math.max(0, parseFloat(String(value)) || 0);
    } else {
      updated[index].description = String(value);
    }
    setLineItems(updated);
  };

  const handleSelectProductPreset = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const updated = [...lineItems];
    updated[index].description = prod.name;
    updated[index].unitPrice = parseFloat(prod.sellingPrice);
    updated[index].productId = prod.id;
    setLineItems(updated);
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setFeedback({ error: "Please select a customer for this invoice." });
      return;
    }

    const invalidItem = lineItems.find((i) => !i.description.trim());
    if (invalidItem) {
      setFeedback({ error: "Please provide a description for all line items." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await createInvoiceAction(business.id, {
        customerId: selectedCustomerId,
        invoiceNumber: customInvoiceNumber || undefined,
        dueDate,
        taxPercent,
        status: "SENT",
        items: lineItems.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setIsCreateOpen(false);
        setLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
        setSelectedCustomerId("");
        setCustomInvoiceNumber("");
        router.refresh();
      }
    });
  };

  const handleUpdateStatus = (invoiceId: string, newStatus: InvoiceStatus) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateInvoiceStatusAction(business.id, invoiceId, newStatus);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        if (viewingInvoice && viewingInvoice.id === invoiceId) {
          setViewingInvoice({ ...viewingInvoice, status: newStatus });
        }
        router.refresh();
      }
    });
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await deleteInvoiceAction(business.id, invoiceId);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setViewingInvoice(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
              Billing Console
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{invoices.length} Invoices Issued</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
            Invoices & Accounts Receivable
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Generate client invoices, track payment milestones, and manage accounts receivable
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsCreateOpen(true);
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-[0_0_25px_-5px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto border border-violet-300/30"
        >
          <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Create New Invoice</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-medium transition-all flex items-center justify-between shadow-lg ${
            feedback.error
              ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
              : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
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

      {/* Filters */}
      <div className="p-4 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 backdrop-blur-xl shadow-md">
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
            placeholder="Search invoices by invoice number (#) or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#060a1a] border border-white/[0.08] focus:border-amber-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#060a1a] border border-white/[0.08] rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-amber-500 focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">All Statuses</option>
          <option value="SENT">Sent / Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="DRAFT">Draft</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Invoices Table (Enterprise Billing Console) */}
      <div className="bg-[#090e24]/70 border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        {filteredInvoices.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              📄
            </div>
            <p className="text-sm font-bold text-white">No invoice records found</p>
            <p className="text-xs text-slate-400">Issue an invoice to bill customers with automated line item calculations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060918]/80 border-b border-white/[0.06] text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Invoice ID</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Issue Date</th>
                  <th className="py-3.5 px-4">Due Date</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Total Amount</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-cyan-300">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      {inv.customer.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(inv.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(inv.dueDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === "PAID"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : inv.status === "SENT"
                            ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                            : inv.status === "OVERDUE"
                            ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 animate-pulse"
                            : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-white font-mono text-sm">
                      {formatMoney(inv.total, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="px-2.5 py-1 bg-white/[0.04] hover:bg-cyan-500/20 text-cyan-300 rounded-lg text-xs font-semibold border border-white/[0.08] hover:border-cyan-500/30 transition cursor-pointer"
                      >
                        View
                      </button>
                      {inv.status !== "PAID" && (
                        <button
                          onClick={() => handleUpdateStatus(inv.id, "PAID")}
                          disabled={isPending}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-semibold border border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  📄
                </div>
                <h2 className="text-base font-black text-white">Generate Client Invoice</h2>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Customer *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="">-- Choose Client --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Invoice Number (Auto if blank)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0001"
                    value={customInvoiceNumber}
                    onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white uppercase focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Payment Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    Invoice Line Items:
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="text-xs text-cyan-300 hover:text-cyan-200 font-bold cursor-pointer"
                  >
                    + Add Line Item
                  </button>
                </div>

                <div className="space-y-2 bg-[#050816] p-3 rounded-2xl border border-white/[0.08]">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="space-y-1.5 pb-2.5 border-b border-white/[0.04] last:border-0 last:pb-0">
                      {products.length > 0 && (
                        <div className="flex justify-end">
                          <select
                            onChange={(e) => handleSelectProductPreset(idx, e.target.value)}
                            className="text-[10px] px-2 py-0.5 bg-[#090d24] border border-white/[0.08] rounded-lg text-slate-300"
                          >
                            <option value="">Choose preset from catalog...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sellingPrice})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          required
                          placeholder="Item description / deliverables..."
                          value={item.description}
                          onChange={(e) => handleLineItemChange(idx, "description", e.target.value)}
                          className="col-span-6 px-3 py-1.5 bg-[#090d24] border border-white/[0.08] rounded-xl text-xs text-white focus:outline-none"
                        />
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(idx, "quantity", e.target.value)}
                          className="col-span-2 px-2 py-1.5 bg-[#090d24] border border-white/[0.08] rounded-xl text-xs text-white text-center font-mono focus:outline-none"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="Price"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(idx, "unitPrice", e.target.value)}
                          className="col-span-3 px-3 py-1.5 bg-[#090d24] border border-white/[0.08] rounded-xl text-xs text-white text-right font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          disabled={lineItems.length === 1}
                          className="col-span-1 text-rose-400 hover:text-rose-300 text-xs disabled:opacity-30 text-center cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3.5 bg-[#050816] rounded-2xl border border-white/[0.08] text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-white font-mono">
                    {formatMoney(subtotalNum, business.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax ({taxPercent}%):</span>
                  <span className="font-semibold text-white font-mono">
                    {formatMoney(taxNum, business.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1.5 border-t border-white/[0.06]">
                  <span>Total Amount:</span>
                  <span className="text-emerald-400 font-black font-mono text-base">
                    {formatMoney(grandTotalNum, business.currency)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  {isPending ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail / Printable Preview Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-cyan-500/30 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Invoice Top Header */}
            <div className="flex justify-between items-start pb-4 border-b border-white/[0.08]">
              <div>
                <span className="font-black text-lg text-white block">{business.name}</span>
                <span className="text-xs text-cyan-300 font-mono">Invoice #{viewingInvoice.invoiceNumber}</span>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    viewingInvoice.status === "PAID"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : viewingInvoice.status === "SENT"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {viewingInvoice.status}
                </span>
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  Due: {new Date(viewingInvoice.dueDate).toLocaleDateString("en-GB")}
                </p>
              </div>
            </div>

            {/* Bill To */}
            <div className="p-3.5 bg-[#050816] rounded-2xl border border-white/[0.08] text-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billed To:</span>
              <p className="font-bold text-white text-sm">{viewingInvoice.customer.name}</p>
              {viewingInvoice.customer.phone && <p className="text-slate-300 font-mono">Phone: {viewingInvoice.customer.phone}</p>}
              {viewingInvoice.customer.email && <p className="text-slate-300">Email: {viewingInvoice.customer.email}</p>}
              {viewingInvoice.customer.address && <p className="text-slate-400">{viewingInvoice.customer.address}</p>}
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-400 font-semibold text-[10px] uppercase">
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-center">Qty</th>
                    <th className="pb-2 text-right">Unit Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-slate-300">
                  {viewingInvoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-white font-medium">{item.description}</td>
                      <td className="py-2.5 text-center font-mono">{item.quantity}</td>
                      <td className="py-2.5 text-right font-mono">{formatMoney(item.unitPrice, business.currency)}</td>
                      <td className="py-2.5 text-right font-bold text-slate-200 font-mono">
                        {formatMoney(item.totalAmount, business.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="space-y-1.5 pt-3 border-t border-white/[0.08] text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-white">{formatMoney(viewingInvoice.subtotal, business.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax:</span>
                <span className="font-mono text-white">{formatMoney(viewingInvoice.tax, business.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1">
                <span>Total Due:</span>
                <span className="text-emerald-400 text-lg font-black font-mono">
                  {formatMoney(viewingInvoice.total, business.currency)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center gap-2 pt-2 border-t border-white/[0.08]">
              <div className="flex items-center gap-2">
                {viewingInvoice.status !== "PAID" && (
                  <button
                    onClick={() => handleUpdateStatus(viewingInvoice.id, "PAID")}
                    disabled={isPending}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Mark as Paid
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDeleteInvoice(viewingInvoice.id)}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-medium border border-rose-500/30 transition cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>

              <button
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
