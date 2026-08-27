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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Invoices & Billing
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Create professional invoices, track due dates, and monitor payment collections
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsCreateOpen(true);
          }}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Create New Invoice
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm transition-all flex items-center justify-between ${
            feedback.error
              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          }`}
        >
          <span>{feedback.error || feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoices by invoice # or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="SENT">Sent / Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="OVERDUE">Overdue</option>
          <option value="DRAFT">Draft</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No invoices found</p>
            <p>Generate an invoice to bill your customers directly.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {inv.customer.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(inv.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
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
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : inv.status === "SENT"
                            ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                            : inv.status === "OVERDUE"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-white text-sm">
                      {formatMoney(inv.total, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        View
                      </button>
                      {inv.status !== "PAID" && (
                        <button
                          onClick={() => handleUpdateStatus(inv.id, "PAID")}
                          disabled={isPending}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium border border-emerald-500/30 transition cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Create New Invoice</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Customer *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Invoice Number (Auto if blank)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0001"
                    value={customInvoiceNumber}
                    onChange={(e) => setCustomInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Payment Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={taxPercent}
                    onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Invoice Items:
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="space-y-1.5 pb-2 border-b border-slate-850 last:border-0 last:pb-0">
                      {products.length > 0 && (
                        <div className="flex justify-end">
                          <select
                            onChange={(e) => handleSelectProductPreset(idx, e.target.value)}
                            className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400"
                          >
                            <option value="">Preset from product catalog...</option>
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
                          placeholder="Item description / service..."
                          value={item.description}
                          onChange={(e) => handleLineItemChange(idx, "description", e.target.value)}
                          className="col-span-6 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(idx, "quantity", e.target.value)}
                          className="col-span-2 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white text-center"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="Price"
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(idx, "unitPrice", e.target.value)}
                          className="col-span-3 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white text-right"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(idx)}
                          disabled={lineItems.length === 1}
                          className="col-span-1 text-rose-400 hover:text-rose-300 text-xs disabled:opacity-30 text-center"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-white">
                    {formatMoney(subtotalNum, business.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax ({taxPercent}%):</span>
                  <span className="font-semibold text-white">
                    {formatMoney(taxNum, business.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                  <span>Total Amount:</span>
                  <span className="text-emerald-400">
                    {formatMoney(grandTotalNum, business.currency)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Invoice Top Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-800">
              <div>
                <span className="font-bold text-lg text-white block">{business.name}</span>
                <span className="text-xs text-slate-400 font-mono">Invoice #{viewingInvoice.invoiceNumber}</span>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    viewingInvoice.status === "PAID"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : viewingInvoice.status === "SENT"
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {viewingInvoice.status}
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  Due: {new Date(viewingInvoice.dueDate).toLocaleDateString("en-GB")}
                </p>
              </div>
            </div>

            {/* Bill To */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Billed To:</span>
              <p className="font-bold text-white text-sm">{viewingInvoice.customer.name}</p>
              {viewingInvoice.customer.phone && <p className="text-slate-300">Phone: {viewingInvoice.customer.phone}</p>}
              {viewingInvoice.customer.email && <p className="text-slate-300">Email: {viewingInvoice.customer.email}</p>}
              {viewingInvoice.customer.address && <p className="text-slate-400">{viewingInvoice.customer.address}</p>}
            </div>

            {/* Line Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-center">Qty</th>
                    <th className="pb-2 text-right">Unit Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {viewingInvoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 text-white font-medium">{item.description}</td>
                      <td className="py-2.5 text-center">{item.quantity}</td>
                      <td className="py-2.5 text-right">{formatMoney(item.unitPrice, business.currency)}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-200">
                        {formatMoney(item.totalAmount, business.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="space-y-1 pt-3 border-t border-slate-800 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>{formatMoney(viewingInvoice.subtotal, business.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tax:</span>
                <span>{formatMoney(viewingInvoice.tax, business.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1">
                <span>Total Due:</span>
                <span className="text-emerald-400 text-base">
                  {formatMoney(viewingInvoice.total, business.currency)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                {viewingInvoice.status !== "PAID" && (
                  <button
                    onClick={() => handleUpdateStatus(viewingInvoice.id, "PAID")}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Mark as Paid
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDeleteInvoice(viewingInvoice.id)}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-medium border border-rose-500/30 transition cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>

              <button
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
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
