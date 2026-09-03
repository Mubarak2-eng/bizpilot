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
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 uppercase tracking-wide">
              Client Directory
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{customers.length} Accounts Linked</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
            Customer CRM Directory
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Manage client contact profiles, purchasing analytics, and invoice history
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
          <span>Add New Customer</span>
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

      {/* Search Filter */}
      <div className="p-4 bg-[#090e24]/70 border border-white/[0.08] rounded-2xl flex items-center justify-between backdrop-blur-xl shadow-md">
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
            placeholder="Search customers by name, email, phone number, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#060a1a] border border-white/[0.08] focus:border-violet-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition"
          />
        </div>
      </div>

      {/* Customers Table (Futuristic CRM) */}
      <div className="bg-[#090e24]/70 border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
        {filteredCustomers.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              👥
            </div>
            <p className="text-sm font-bold text-white">No customer profiles found</p>
            <p className="text-xs text-slate-400">Add client records to track lifetime purchases and issue invoices.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060918]/80 border-b border-white/[0.06] text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Customer Profile</th>
                  <th className="py-3.5 px-4">Contact Telemetry</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4 text-center">Purchases</th>
                  <th className="py-3.5 px-4 text-right">Lifetime Value</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {filteredCustomers.map((c) => {
                  const initials = c.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-600/20 shrink-0">
                            {initials}
                          </div>
                          <span className="font-bold text-white text-sm">{c.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 space-y-0.5">
                        {c.phone && <p className="text-cyan-300 font-mono text-[11px]">{c.phone}</p>}
                        {c.email && <p className="text-[11px] text-slate-400">{c.email}</p>}
                        {!c.phone && !c.email && <span className="text-slate-500 font-normal">No contact record</span>}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 truncate max-w-xs">
                        {c.address || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/[0.04] text-slate-300 font-semibold text-xs border border-white/[0.08] font-mono">
                          {c.salesCount} {c.salesCount === 1 ? "sale" : "sales"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-emerald-400 font-mono text-sm">
                        {formatMoney(c.totalSpent, business.currency)}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => setViewingCustomer(c)}
                          className="px-2.5 py-1 bg-white/[0.04] hover:bg-cyan-500/20 text-cyan-300 rounded-lg text-xs font-semibold border border-white/[0.08] hover:border-cyan-500/30 transition cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          onClick={() => {
                            setFeedback(null);
                            setEditingCustomer(c);
                          }}
                          className="px-2.5 py-1 bg-white/[0.04] hover:bg-violet-500/20 text-slate-200 hover:text-violet-300 rounded-lg text-xs font-medium border border-white/[0.08] hover:border-violet-500/30 transition cursor-pointer"
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Customer Modal */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-cyan-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-xs">
                  CRM
                </div>
                <h2 className="text-base font-black text-white">{viewingCustomer.name}</h2>
              </div>
              <button
                onClick={() => setViewingCustomer(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-slate-400">Phone:</span>
                <span className="text-white font-mono font-medium">{viewingCustomer.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-slate-400">Email:</span>
                <span className="text-white font-medium">{viewingCustomer.email || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-slate-400">Address:</span>
                <span className="text-white font-medium">{viewingCustomer.address || "N/A"}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-slate-400">Total Transactions:</span>
                <span className="text-cyan-300 font-semibold font-mono">{viewingCustomer.salesCount} Sales</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-slate-400">Invoices Linked:</span>
                <span className="text-amber-300 font-semibold font-mono">{viewingCustomer.invoicesCount} Invoices</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Total Lifetime Value:</span>
                <span className="text-emerald-400 font-black text-base font-mono">
                  {formatMoney(viewingCustomer.totalSpent, business.currency)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.08] flex justify-end">
              <button
                onClick={() => setViewingCustomer(null)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  +
                </div>
                <h2 className="text-base font-black text-white">Create Customer Profile</h2>
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
                  Full Customer Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Ibrahim Abubakar"
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  name="phone"
                  type="tel"
                  placeholder="+234 800 000 0000"
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="ibrahim@example.com"
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Physical / Billing Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  placeholder="Street address, city, state..."
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
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
                  {isPending ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bg-[#090d24] border border-violet-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  ✏️
                </div>
                <h2 className="text-base font-black text-white">Edit Customer Profile</h2>
              </div>
              <button
                onClick={() => setEditingCustomer(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Customer Name *
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingCustomer.name}
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  name="phone"
                  type="tel"
                  defaultValue={editingCustomer.phone || ""}
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingCustomer.email || ""}
                  className="w-full px-3 py-2.5 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Physical / Billing Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  defaultValue={editingCustomer.address || ""}
                  className="w-full px-3 py-2 bg-[#050816] border border-white/[0.1] focus:border-violet-500 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
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
