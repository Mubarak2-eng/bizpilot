"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { createProductAction, updateProductAction, deleteProductAction } from "@/lib/actions/products";

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  sellingPrice: string;
  costPrice: string;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: string;
}

interface ProductsManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  products: ProductItem[];
}

export default function ProductsManager({
  business,
  role,
  products,
}: ProductsManagerProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canDelete = role === "OWNER" || role === "ADMIN";

  // Filter products by search term & low stock
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLowStock = filterLowStockOnly
      ? p.stockQuantity <= p.lowStockThreshold
      : true;
    return matchesSearch && matchesLowStock;
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await createProductAction(business.id, formData);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setIsCreateOpen(false);
        router.refresh();
      }
    });
  };

  const handleUpdateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct) return;
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateProductAction(business.id, editingProduct.id, formData);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setEditingProduct(null);
        router.refresh();
      }
    });
  };

  const handleDelete = (product: ProductItem) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await deleteProductAction(business.id, product.id);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
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
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase tracking-wide">
              Inventory Matrix
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{products.length} Total SKUs</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
            Products & Inventory Catalog
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Manage catalog pricing, barcodes, and real-time inventory threshold telemetry
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
          <span>Add New Product</span>
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

      {/* Controls: Search and Low-stock filter */}
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
            placeholder="Search products by title, SKU code, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#060a1a] border border-white/[0.08] focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-2 ${
              filterLowStockOnly
                ? "bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                : "bg-[#060a1a] border-white/[0.08] text-slate-400 hover:text-white"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filterLowStockOnly ? "bg-rose-400 animate-beacon" : "bg-slate-600"}`} />
            <span>Low Stock Alerts Only</span>
          </button>
        </div>
      </div>

      {/* Products Table (High-Tech Matrix) */}
      <div className="bg-[#090e24]/70 border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        {filteredProducts.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              📦
            </div>
            <p className="text-sm font-bold text-white">No products found</p>
            <p className="text-xs text-slate-400">Try adjusting your search criteria or add a new SKU.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060918]/80 border-b border-white/[0.06] text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Product Details</th>
                  <th className="py-3.5 px-4">SKU / Barcode</th>
                  <th className="py-3.5 px-4">Selling Price</th>
                  <th className="py-3.5 px-4">Cost Price</th>
                  <th className="py-3.5 px-4 text-center">Stock Telemetry</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {filteredProducts.map((p) => {
                  const isLowStock = p.stockQuantity <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white text-sm">{p.name}</p>
                        {p.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">{p.description}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <code className="text-cyan-300 font-mono text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                          {p.sku}
                        </code>
                        {p.barcode && (
                          <p className="text-[10px] text-slate-400 font-mono mt-1">Barcode: {p.barcode}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-black text-white font-mono text-sm">
                        {formatMoney(p.sellingPrice, business.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">
                        {formatMoney(p.costPrice, business.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold font-mono ${
                            isLowStock
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 animate-pulse"
                              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {p.stockQuantity} units
                        </span>
                        {isLowStock && (
                          <p className="text-[9px] text-rose-400 font-semibold mt-0.5">Threshold: ≤{p.lowStockThreshold}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setFeedback(null);
                            setEditingProduct(p);
                          }}
                          className="px-2.5 py-1 bg-white/[0.04] hover:bg-violet-500/20 text-slate-200 hover:text-violet-300 rounded-lg text-xs font-medium border border-white/[0.08] hover:border-violet-500/30 transition cursor-pointer"
                        >
                          Edit
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isPending}
                            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-medium border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Product Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
                  +
                </div>
                <h2 className="text-base font-black text-white">Add New Product SKU</h2>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Product Title *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Wireless Ergonomic Mouse"
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    SKU Code (Unique) *
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    placeholder="e.g. ELEC-MOU-001"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white uppercase focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="e.g. 600123456789"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Selling Price ({business.currency}) *
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="25000.00"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Cost Price ({business.currency})
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0.00"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Initial Stock Qty *
                  </label>
                  <input
                    name="stockQuantity"
                    type="number"
                    min="0"
                    required
                    defaultValue="10"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Low Stock Threshold *
                  </label>
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    required
                    defaultValue="5"
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional product description..."
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none"
                />
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
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  {isPending ? "Adding..." : "Add Product SKU"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  ✏️
                </div>
                <h2 className="text-base font-black text-white">Edit Product SKU</h2>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Product Title *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingProduct.name}
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    SKU Code (Unique) *
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    defaultValue={editingProduct.sku}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white uppercase focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    defaultValue={editingProduct.barcode || ""}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Selling Price ({business.currency}) *
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={editingProduct.sellingPrice}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Cost Price ({business.currency})
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={editingProduct.costPrice}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    name="stockQuantity"
                    type="number"
                    min="0"
                    required
                    defaultValue={editingProduct.stockQuantity}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Low Stock Threshold *
                  </label>
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    required
                    defaultValue={editingProduct.lowStockThreshold}
                    className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingProduct.description || ""}
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  {isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
