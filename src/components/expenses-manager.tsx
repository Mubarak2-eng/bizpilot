"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { createExpenseAction, updateExpenseAction, deleteExpenseAction } from "@/lib/actions/expenses";

export interface ExpenseItem {
  id: string;
  category: string;
  description: string | null;
  amount: string;
  createdAt: string;
}

interface ExpensesManagerProps {
  business: {
    id: string;
    name: string;
    currency: string;
  };
  role: Role;
  expenses: ExpenseItem[];
}

const COMMON_CATEGORIES = [
  "Rent",
  "Utilities",
  "Supplies",
  "Marketing",
  "Transport",
  "Salaries",
  "Maintenance",
  "Taxes & Fees",
  "Other",
];

export default function ExpensesManager({
  business,
  role,
  expenses,
}: ExpensesManagerProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canDelete = role === "OWNER" || role === "ADMIN";

  const filteredExpenses = expenses.filter((e) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      e.category.toLowerCase().includes(term) ||
      (e.description && e.description.toLowerCase().includes(term));
    const matchesCat = selectedCategory === "ALL" || e.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Calculate total expense amount
  const totalAmount = filteredExpenses.reduce(
    (sum, e) => sum + parseFloat(e.amount),
    0
  );

  // Group by category for breakdown
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + parseFloat(e.amount);
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await createExpenseAction(business.id, formData);
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
    if (!editingExpense) return;
    setFeedback(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateExpenseAction(business.id, editingExpense.id, formData);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setEditingExpense(null);
        router.refresh();
      }
    });
  };

  const handleDelete = (expense: ExpenseItem) => {
    if (!confirm(`Delete expense of ${formatMoney(expense.amount, business.currency)} under ${expense.category}?`)) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await deleteExpenseAction(business.id, expense.id);
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
            Operating Expenses
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Track overhead costs, categorize spending, and monitor business outflows
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
          Record Expense
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

      {/* Category Breakdown Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(categoryTotals).map(([cat, amt]) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? "ALL" : cat)}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              selectedCategory === cat
                ? "bg-indigo-600/20 border-indigo-500 text-white"
                : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            <span className="text-[10px] text-slate-400 block font-medium uppercase truncate">{cat}</span>
            <span className="text-sm font-bold text-white block mt-0.5">
              {formatMoney(amt, business.currency)}
            </span>
          </button>
        ))}
      </div>

      {/* Controls & Search */}
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
            placeholder="Search expenses by category or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Categories</option>
          {COMMON_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Expense Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No expense records found</p>
            <p>Click &quot;Record Expense&quot; to log your business expenses.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount ({business.currency})</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(exp.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 max-w-sm truncate">
                      {exp.description || <span className="text-slate-500">No description provided</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-400 text-sm">
                      {formatMoney(exp.amount, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setFeedback(null);
                          setEditingExpense(exp);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
                      >
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(exp)}
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
              <tfoot className="bg-slate-950/80 border-t border-slate-800 text-white font-bold">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-slate-300 text-right">
                    Total Displayed Expenses:
                  </td>
                  <td className="py-3 px-4 text-right text-rose-400 text-sm font-extrabold">
                    {formatMoney(totalAmount, business.currency)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Create Expense Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Record Operating Expense</h2>
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
                  Expense Category *
                </label>
                <input
                  name="category"
                  type="text"
                  list="category-options"
                  required
                  placeholder="e.g. Electricity, Fuel, Supplies..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <datalist id="category-options">
                  {COMMON_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Amount ({business.currency}) *
                </label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="15000.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Date of Expense
                </label>
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description / Vendor Details
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Optional details or vendor reference..."
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
                  {isPending ? "Recording..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Edit Expense Record</h2>
              <button
                onClick={() => setEditingExpense(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Expense Category *
                </label>
                <input
                  name="category"
                  type="text"
                  required
                  defaultValue={editingExpense.category}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Amount ({business.currency}) *
                </label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={editingExpense.amount}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Date
                </label>
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date(editingExpense.createdAt).toISOString().split("T")[0]}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingExpense.description || ""}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
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
