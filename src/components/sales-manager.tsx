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

    // Check if already in cart
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
      // remove item
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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Sales & POS
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Record customer transactions, auto-decrement stock, and track sales revenue
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsNewSaleOpen(true);
          }}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Record New Sale
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
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
            placeholder="Search sales by customer, product, or receipt ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      {/* Sales History Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredSales.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No sales transactions found</p>
            <p>Click &quot;Record New Sale&quot; to make your first sale.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Items Breakdown</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(s.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      {s.customer?.name || <span className="text-slate-500 font-normal">Walk-in Customer</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-xs truncate">
                      {s.items.map((i) => `${i.productName} (${i.quantity}x)`).join(", ")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : s.status === "PENDING"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-400 text-sm">
                      {formatMoney(s.totalAmount, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedSale(s)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
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

      {/* Record New Sale Modal */}
      {isNewSaleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Record New Point-of-Sale (POS) Transaction</h2>
              <button
                onClick={() => setIsNewSaleOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Customer & Settings Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Customer (Optional)
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card (POS Terminal)</option>
                  <option value="TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money (M-Pesa, MoMo, etc.)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Status *
                </label>
                <select
                  value={saleStatus}
                  onChange={(e) => setSaleStatus(e.target.value as SaleStatus)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="COMPLETED">Completed (Deduct Stock)</option>
                  <option value="PENDING">Pending (Draft Order)</option>
                </select>
              </div>
            </div>

            {/* Catalog Item Quick Picker */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Click Product to Add to Sale:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
                {products.map((p) => {
                  const outOfStock = p.stockQuantity <= 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => handleAddProductToSale(p.id)}
                      className={`p-2 rounded-lg text-left text-xs border transition cursor-pointer flex flex-col justify-between ${
                        outOfStock
                          ? "bg-slate-900/50 border-slate-800 opacity-40 cursor-not-allowed"
                          : "bg-slate-900 border-slate-800 hover:border-indigo-500 hover:bg-slate-850 text-white"
                      }`}
                    >
                      <span className="font-semibold truncate">{p.name}</span>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                        <span className="text-emerald-400 font-bold">
                          {formatMoney(p.sellingPrice, business.currency)}
                        </span>
                        <span className={p.stockQuantity <= 5 ? "text-rose-400 font-bold" : ""}>
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
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Sale Items ({saleItems.length}):
              </label>

              {saleItems.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                  No items selected yet. Choose products from the catalog above.
                </div>
              ) : (
                <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800 divide-y divide-slate-850">
                  {saleItems.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const lineTotal = item.quantity * item.unitPrice;

                    return (
                      <div key={item.productId} className="flex items-center justify-between gap-3 pt-2 first:pt-0">
                        <div className="truncate flex-1">
                          <p className="font-semibold text-xs text-white truncate">{prod?.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatMoney(item.unitPrice, business.currency)} / unit
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                            className="w-6 h-6 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                            className="w-6 h-6 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                        </div>

                        <div className="w-24 text-right">
                          <p className="text-xs font-bold text-emerald-400">
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
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-sm font-semibold text-slate-300">Grand Total:</span>
              <span className="text-xl font-extrabold text-emerald-400">
                {formatMoney(newSaleTotal, business.currency)}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewSaleOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSale}
                disabled={isPending || saleItems.length === 0}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                {isPending ? "Processing..." : `Confirm Sale (${formatMoney(newSaleTotal, business.currency)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Detail / Receipt Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white">Sale Receipt</h2>
                <p className="text-[11px] text-slate-400 font-mono">ID: {selectedSale.id}</p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Date:</span>
                <span className="text-white font-medium">
                  {new Date(selectedSale.createdAt).toLocaleString("en-GB")}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Customer:</span>
                <span className="text-white font-semibold">
                  {selectedSale.customer?.name || "Walk-in Customer"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Payment Method:</span>
                <span className="text-slate-200 font-medium">{selectedSale.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
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
                <p className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">Items Purchased:</p>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  {selectedSale.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs">
                      <div>
                        <p className="text-white font-medium">{item.productName}</p>
                        <p className="text-[10px] text-slate-400">
                          {item.quantity} × {formatMoney(item.unitPrice, business.currency)}
                        </p>
                      </div>
                      <span className="font-bold text-slate-200">
                        {formatMoney(item.totalAmount, business.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-slate-950 rounded-xl border border-slate-800 text-sm font-bold">
                <span className="text-slate-300">Total Paid:</span>
                <span className="text-emerald-400 text-base">
                  {formatMoney(selectedSale.totalAmount, business.currency)}
                </span>
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2 border-t border-slate-800">
              {canCancel && selectedSale.status === "COMPLETED" && (
                <button
                  onClick={() => handleCancelSale(selectedSale.id)}
                  disabled={isPending}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel Sale & Restore Stock
                </button>
              )}
              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition ml-auto cursor-pointer"
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
