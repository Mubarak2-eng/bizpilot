"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { PaymentMethod, SaleStatus } from "@prisma/client";
import { createSaleAction, cancelSaleAction } from "@/lib/actions/sales";

export interface SaleRecord {
  id: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: string;
    totalAmount: string;
  }[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  stockQuantity: number;
}

export interface CustomerOption {
  id: string;
  name: string;
}

interface SalesManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  sales: SaleRecord[];
  products: CatalogProduct[];
  customers: CustomerOption[];
}

export default function SalesManager({
  business,
  role,
  sales,
  products,
  customers,
}: SalesManagerProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // New Sale POS Form State
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [saleStatus, setSaleStatus] = useState<SaleStatus>("COMPLETED");
  const [saleItems, setSaleItems] = useState<
    { productId: string; quantity: number; unitPrice: number }[]
  >([]);

  // Receipt / Detail View State
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canCancel = role === "OWNER" || role === "ADMIN";

  // Filter Sales list
  const filteredSales = sales.filter((s) => {
    const matchesSearch =
      (s.customer && s.customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.items.some((i) => i.productName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesPayment = paymentFilter === "ALL" || s.paymentMethod === paymentFilter;
    const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;

    return matchesSearch && matchesPayment && matchesStatus;
  });

  // Calculate live total for new sale
  const newSaleTotal = saleItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const handleAddProductToSale = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const existingIndex = saleItems.findIndex((item) => item.productId === productId);
    if (existingIndex > -1) {
      const updated = [...saleItems];
      const newQty = updated[existingIndex].quantity + 1;
      if (newQty <= product.stockQuantity) {
        updated[existingIndex].quantity = newQty;
        setSaleItems(updated);
      } else {
        setFeedback({ error: `Cannot add more: only ${product.stockQuantity} units in stock.` });
      }
    } else {
      if (product.stockQuantity >= 1) {
        setSaleItems([
          ...saleItems,
          {
            productId: product.id,
            quantity: 1,
            unitPrice: parseFloat(product.sellingPrice),
          },
        ]);
      } else {
        setFeedback({ error: `"${product.name}" is currently out of stock!` });
      }
    }
  };

  const handleUpdateItemQty = (index: number, quantity: number) => {
    const updated = [...saleItems];
    const item = updated[index];
    const product = products.find((p) => p.id === item.productId);

    if (quantity <= 0) {
      updated.splice(index, 1);
      setSaleItems(updated);
      return;
    }

    if (product && quantity > product.stockQuantity) {
      setFeedback({ error: `Maximum available stock is ${product.stockQuantity}.` });
      return;
    }

    item.quantity = quantity;
    setSaleItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = [...saleItems];
    updated.splice(index, 1);
    setSaleItems(updated);
  };

  const handleCreateSale = () => {
    if (saleItems.length === 0) {
      setFeedback({ error: "Please add at least one product to the sale." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await createSaleAction(business.id, {
        customerId: selectedCustomerId || null,
        paymentMethod,
        status: saleStatus,
        items: saleItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setIsNewSaleOpen(false);
        setSaleItems([]);
        setSelectedCustomerId("");
        router.refresh();
      }
    });
  };

  const handleCancelSale = (saleId: string) => {
    if (!confirm("Are you sure you want to cancel this sale? Stock will be restored to inventory.")) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await cancelSaleAction(business.id, saleId, "CANCELLED");
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setSelectedSale(null);
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
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 uppercase tracking-wide">
              Point of Sale
            </span>
            <span className="text-[11px] text-slate-400 font-mono">Live Inventory Link</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
            Sales & POS Terminal
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Process checkout transactions, auto-decrement stock, and track real-time revenue
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsNewSaleOpen(true);
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-[0_0_25px_-5px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto border border-violet-300/30"
        >
          <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Record New Sale</span>
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

      {/* Filters Bar */}
      <div className="p-4 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 backdrop-blur-xl shadow-md">
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
            placeholder="Search sales by customer, product name, or receipt ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#060a1a] border border-white/[0.08] focus:border-violet-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-[#060a1a] border border-white/[0.08] rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-violet-500 focus:outline-none transition cursor-pointer"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="TRANSFER">Bank Transfer</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#060a1a] border border-white/[0.08] rounded-xl text-xs text-slate-300 focus:ring-1 focus:ring-violet-500 focus:outline-none transition cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      {/* Sales History Table (Fintech Terminal) */}
      <div className="bg-[#090e24]/70 border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        {filteredSales.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              💳
            </div>
            <p className="text-sm font-bold text-white">No sales transactions found</p>
            <p className="text-xs text-slate-400">Click &quot;Record New Sale&quot; to make your first transaction.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060918]/80 border-b border-white/[0.06] text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date / Time</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Items Breakdown</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Total Amount</th>
                  <th className="py-3.5 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {filteredSales.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(s.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                          {(s.customer?.name || "W")[0].toUpperCase()}
                        </span>
                        <span className="truncate max-w-[140px]">
                          {s.customer?.name || <span className="text-slate-400 font-normal">Walk-in</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                      {s.items.map((i) => `${i.productName} (${i.quantity}x)`).join(", ")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.04] text-slate-300 border border-white/[0.08]">
                        {s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : s.status === "PENDING"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-400 text-sm font-mono">
                      {formatMoney(s.totalAmount, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedSale(s)}
                        className="px-2.5 py-1 bg-white/[0.04] hover:bg-violet-500/20 text-violet-300 rounded-lg text-xs font-semibold border border-white/[0.08] hover:border-violet-500/40 transition cursor-pointer"
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record New POS Sale Modal */}
      {isNewSaleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-[0_0_50px_-10px_rgba(139,92,246,0.3)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  ⚡
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Record Point-of-Sale Transaction</h2>
                  <p className="text-[10px] text-slate-400 font-mono">Auto stock decrement & revenue tracking</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewSaleOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Customer & Settings Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Customer
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] rounded-xl text-xs text-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] rounded-xl text-xs text-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card (POS Terminal)</option>
                  <option value="TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Status *
                </label>
                <select
                  value={saleStatus}
                  onChange={(e) => setSaleStatus(e.target.value as SaleStatus)}
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] rounded-xl text-xs text-white focus:ring-1 focus:ring-violet-500 focus:outline-none"
                >
                  <option value="COMPLETED">Completed (Deduct Stock)</option>
                  <option value="PENDING">Pending (Draft Order)</option>
                </select>
              </div>
            </div>

            {/* Catalog Item Quick Picker */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Click Product to Add to Cart:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-2.5 bg-[#050816] rounded-2xl border border-white/[0.08]">
                {products.map((p) => {
                  const outOfStock = p.stockQuantity <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => handleAddProductToSale(p.id)}
                      className={`p-3 rounded-xl text-left text-xs border transition cursor-pointer flex flex-col justify-between ${
                        outOfStock
                          ? "bg-white/[0.01] border-white/[0.04] opacity-40 cursor-not-allowed"
                          : "bg-white/[0.03] border-white/[0.08] hover:border-violet-500/50 hover:bg-violet-500/10 text-white"
                      }`}
                    >
                      <span className="font-bold truncate text-white">{p.name}</span>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2">
                        <span className="text-emerald-400 font-bold font-mono">
                          {formatMoney(p.sellingPrice, business.currency)}
                        </span>
                        <span className={`font-mono ${p.stockQuantity <= 5 ? "text-rose-400 font-bold" : "text-slate-400"}`}>
                          {p.stockQuantity} in stock
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Items Cart */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Cart Items ({saleItems.length}):
              </label>

              {saleItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 bg-[#050816]/60 rounded-2xl border border-dashed border-white/[0.08]">
                  No items in cart yet. Select products from the catalog above.
                </div>
              ) : (
                <div className="space-y-2 bg-[#050816] p-3 rounded-2xl border border-white/[0.08] divide-y divide-white/[0.04]">
                  {saleItems.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const lineTotal = item.quantity * item.unitPrice;

                    return (
                      <div key={item.productId} className="flex items-center justify-between gap-3 pt-2 first:pt-0">
                        <div className="truncate flex-1">
                          <p className="font-bold text-xs text-white truncate">{prod?.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatMoney(item.unitPrice, business.currency)} / unit
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                            className="w-6 h-6 rounded-lg bg-white/[0.08] text-white hover:bg-white/[0.15] flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-white font-mono">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                            className="w-6 h-6 rounded-lg bg-white/[0.08] text-white hover:bg-white/[0.15] flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>

                        <div className="w-24 text-right">
                          <p className="text-xs font-bold text-emerald-400 font-mono">
                            {formatMoney(lineTotal, business.currency)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-400 hover:text-rose-300 text-xs p-1"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total Summary Footer */}
            <div className="flex items-center justify-between p-4 bg-[#050816] rounded-2xl border border-white/[0.08]">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Grand Total:</span>
              <span className="text-xl font-black text-emerald-400 font-mono">
                {formatMoney(newSaleTotal, business.currency)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setIsNewSaleOpen(false)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSale}
                disabled={isPending || saleItems.length === 0}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                {isPending ? "Processing..." : `Confirm Sale (${formatMoney(newSaleTotal, business.currency)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Detail / Receipt Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h2 className="text-base font-black text-white">Official Sale Receipt</h2>
                <p className="text-[10px] text-slate-400 font-mono">Receipt ID: {selectedSale.id}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-400">Date & Time:</span>
                <span className="text-white font-mono font-medium">
                  {new Date(selectedSale.createdAt).toLocaleString("en-GB")}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-400">Customer:</span>
                <span className="text-white font-bold">
                  {selectedSale.customer?.name || "Walk-in Customer"}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-400">Payment Method:</span>
                <span className="text-cyan-300 font-semibold">{selectedSale.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-400">Status:</span>
                <span
                  className={`font-bold ${
                    selectedSale.status === "COMPLETED"
                      ? "text-emerald-400"
                      : selectedSale.status === "PENDING"
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {selectedSale.status}
                </span>
              </div>

              {/* Items List */}
              <div className="pt-2 space-y-2">
                <p className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Items Purchased:</p>
                <div className="bg-[#050816] p-3.5 rounded-2xl border border-white/[0.08] space-y-2">
                  {selectedSale.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs">
                      <div>
                        <p className="text-white font-medium">{item.productName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {item.quantity} × {formatMoney(item.unitPrice, business.currency)}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-400 font-mono">
                        {formatMoney(item.totalAmount, business.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center p-3.5 bg-[#050816] rounded-2xl border border-white/[0.08] text-sm font-bold">
                <span className="text-slate-300">Total Paid:</span>
                <span className="text-emerald-400 text-lg font-black font-mono">
                  {formatMoney(selectedSale.totalAmount, business.currency)}
                </span>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-3 border-t border-white/[0.08]">
              {canCancel && selectedSale.status === "COMPLETED" && (
                <button
                  onClick={() => handleCancelSale(selectedSale.id)}
                  disabled={isPending}
                  className="px-3.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded-xl text-xs font-semibold border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel Sale & Restore Stock
                </button>
              )}
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-medium transition ml-auto cursor-pointer"
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
