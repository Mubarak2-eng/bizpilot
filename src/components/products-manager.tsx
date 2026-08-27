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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Products & Inventory
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Manage catalog pricing, barcodes, and real-time inventory levels
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
          Add New Product
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

      {/* Controls: Search and Low-stock filter */}
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
            placeholder="Search by product name, SKU, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              filterLowStockOnly
                ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filterLowStockOnly ? "bg-rose-400" : "bg-slate-600"}`}></span>
            Low Stock Filter
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No products found</p>
            <p>Try clearing your search or add a new product to the catalog.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-4">SKU / Barcode</th>
                  <th className="py-3 px-4">Selling Price</th>
                  <th className="py-3 px-4">Cost Price</th>
                  <th className="py-3 px-4 text-center">Stock Level</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredProducts.map((p) => {
                  const isLowStock = p.stockQuantity <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white text-sm">{p.name}</p>
                        {p.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">{p.description}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <code className="text-indigo-400 font-mono text-xs">{p.sku}</code>
                        {p.barcode && (
                          <p className="text-[11px] text-slate-400 font-mono">Barcode: {p.barcode}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        {formatMoney(p.sellingPrice, business.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {formatMoney(p.costPrice, business.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            isLowStock
                              ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {p.stockQuantity} units
                        </span>
                        {isLowStock && (
                          <p className="text-[10px] text-rose-400 font-semibold mt-0.5">Low Stock (≤{p.lowStockThreshold})</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setFeedback(null);
                            setEditingProduct(p);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Add New Product to Catalog</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Wireless Ergonomic Mouse"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    SKU (Unique) *
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    placeholder="e.g. ELEC-MOU-001"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Barcode (Optional)
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    placeholder="e.g. 600123456789"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Selling Price ({business.currency}) *
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="25000.00"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cost Price ({business.currency})
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0.00"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Initial Stock Qty *
                  </label>
                  <input
                    name="stockQuantity"
                    type="number"
                    min="0"
                    required
                    defaultValue="10"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Low Stock Threshold *
                  </label>
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    required
                    defaultValue="5"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional product details..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Adding..." : "Add Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Edit Product</h2>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingProduct.name}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    SKU (Unique) *
                  </label>
                  <input
                    name="sku"
                    type="text"
                    required
                    defaultValue={editingProduct.sku}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Barcode
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    defaultValue={editingProduct.barcode || ""}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Selling Price ({business.currency}) *
                  </label>
                  <input
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={editingProduct.sellingPrice}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cost Price ({business.currency})
                  </label>
                  <input
                    name="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={editingProduct.costPrice}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    name="stockQuantity"
                    type="number"
                    min="0"
                    required
                    defaultValue={editingProduct.stockQuantity}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Low Stock Threshold *
                  </label>
                  <input
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    required
                    defaultValue={editingProduct.lowStockThreshold}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingProduct.description || ""}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
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
