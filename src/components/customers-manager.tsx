"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/types/auth";
import { formatMoney } from "@/lib/money";
import { createCustomerAction, updateCustomerAction, deleteCustomerAction } from "@/lib/actions/customers";

export interface CustomerItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  salesCount: number;
  totalSpent: string;
  invoicesCount: number;
  createdAt: string;
}

interface CustomersManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  customers: CustomerItem[];
}

export default function CustomersManager({
  business,
  role,
  customers,
}: CustomersManagerProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerItem | null>(null);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canDelete = role === "OWNER" || role === "ADMIN";

  const filteredCustomers = customers.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.toLowerCase().includes(term)) ||
      (c.address && c.address.toLowerCase().includes(term))
    );
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await createCustomerAction(business.id, formData);
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
    if (!editingCustomer) return;
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateCustomerAction(business.id, editingCustomer.id, formData);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setEditingCustomer(null);
        router.refresh();
      }
    });
  };

  const handleDelete = (customer: CustomerItem) => {
    if (!confirm(`Are you sure you want to delete customer "${customer.name}"?`)) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await deleteCustomerAction(business.id, customer.id);
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
            Customer Directory
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Manage client contact information, purchase records, and invoice history
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
          Add New Customer
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

      {/* Search Filter */}
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between">
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
            placeholder="Search customers by name, email, phone, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No customers found</p>
            <p>Add your first customer to track their sales and send invoices.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-center">Purchases</th>
                  <th className="py-3 px-4 text-right">Total Spent</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white text-sm">
                      {c.name}
                    </td>
                    <td className="py-3.5 px-4 space-y-0.5">
                      {c.phone && <p className="text-slate-300">{c.phone}</p>}
                      {c.email && <p className="text-[11px] text-slate-400">{c.email}</p>}
                      {!c.phone && !c.email && <span className="text-slate-500">No contact info</span>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 truncate max-w-xs">
                      {c.address || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700">
                        {c.salesCount} sale{c.salesCount !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                      {formatMoney(c.totalSpent, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setViewingCustomer(c)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        onClick={() => {
                          setFeedback(null);
                          setEditingCustomer(c);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(c)}
                          disabled={isPending}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-medium border border-rose-500/30 transition cursor-pointer disabled:opacity-50"
                        >
                          Delete
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

      {/* View Customer Modal */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">{viewingCustomer.name}</h2>
              <button
                onClick={() => setViewingCustomer(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Phone:</span>
                <span className="text-white font-medium">{viewingCustomer.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Email:</span>
                <span className="text-white font-medium">{viewingCustomer.email || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Address:</span>
                <span className="text-white font-medium">{viewingCustomer.address || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Total Sales Recorded:</span>
                <span className="text-indigo-400 font-semibold">{viewingCustomer.salesCount}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Invoices Linked:</span>
                <span className="text-amber-400 font-semibold">{viewingCustomer.invoicesCount}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Total Lifetime Value:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {formatMoney(viewingCustomer.totalSpent, business.currency)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setViewingCustomer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Add New Customer</h2>
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
                  Customer Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Ibrahim Abubakar"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+234 800 000 0000"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="ibrahim@example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Physical Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  placeholder="Street address, city, state..."
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
                  {isPending ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Edit Customer</h2>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingCustomer.name}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editingCustomer.phone || ""}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingCustomer.email || ""}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Physical Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  defaultValue={editingCustomer.address || ""}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
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
