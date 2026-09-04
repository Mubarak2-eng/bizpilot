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
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 uppercase tracking-wide">
              Financial Outflows
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{expenses.length} Records Logged</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Operating Expenses Tracker
          </h1>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
            Log overhead disbursements, categorize spending, and monitor business operational costs
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsCreateOpen(true);
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/25 dark:shadow-[0_0_25px_-5px_rgba(244,63,94,0.5)] transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto border border-rose-400/30"
        >
          <svg className="w-4 h-4 text-rose-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Record Expense</span>
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

      {/* Category Breakdown Metric Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(categoryTotals).map(([cat, amt]) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? "ALL" : cat)}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer shadow-xs ${
              selectedCategory === cat
                ? "bg-rose-100 dark:bg-rose-500/20 border-rose-400 dark:border-rose-500/60 text-slate-900 dark:text-white shadow-md shadow-rose-500/10"
                : "bg-white/90 dark:bg-[#090e24]/70 border-slate-200/90 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
            }`}
          >
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase truncate tracking-wider">{cat}</span>
            <span className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono block mt-1">
              {formatMoney(amt, business.currency)}
            </span>
          </button>
        ))}
      </div>

      {/* Controls & Search */}
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
            placeholder="Search expenses by category or vendor description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition shadow-xs"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          aria-label="Filter expenses by category"
          className="px-3 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] rounded-xl text-xs text-slate-800 dark:text-slate-300 focus:ring-1 focus:ring-rose-500 focus:outline-none transition cursor-pointer shadow-xs"
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
      <div className="bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-md dark:shadow-xl">
        {filteredExpenses.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              📊
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">No expense entries found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Click &quot;Record Expense&quot; to log your business outflows.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#060918]/80 border-b border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Description / Vendor</th>
                  <th className="py-3.5 px-4 text-right">Amount ({business.currency})</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-slate-700 dark:text-slate-300">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {new Date(exp.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-white/[0.04] text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/25">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 max-w-sm truncate">
                      {exp.description || <span className="text-slate-400 dark:text-slate-500">No description provided</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-rose-600 dark:text-rose-400 text-sm font-mono">
                      {formatMoney(exp.amount, business.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setFeedback(null);
                          setEditingExpense(exp);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 dark:bg-white/[0.04] dark:hover:bg-rose-500/20 text-slate-700 hover:text-rose-700 dark:text-slate-200 dark:hover:text-rose-300 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/[0.08] hover:border-rose-300 dark:hover:border-rose-500/30 transition cursor-pointer shadow-xs"
                      >
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(exp)}
                          disabled={isPending}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-medium border border-rose-200 dark:border-rose-500/30 transition cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-[#060918]/90 border-t border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white font-bold">
                <tr>
                  <td colSpan={3} className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-right uppercase text-[10px] tracking-wider">
                    Total Displayed Expenses:
                  </td>
                  <td className="py-3.5 px-4 text-right text-rose-600 dark:text-rose-400 text-base font-black font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-rose-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-700 dark:text-rose-300">
                  💸
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">Record Operating Expense</h2>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="create-expense-category" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Expense Category *
                </label>
                <input
                  id="create-expense-category"
                  name="category"
                  type="text"
                  list="category-options"
                  required
                  placeholder="e.g. Electricity, Generator Fuel, Rent..."
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
                <datalist id="category-options">
                  {COMMON_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="create-expense-amount" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Amount ({business.currency}) *
                </label>
                <input
                  id="create-expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="15000.00"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="create-expense-date" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Date of Expense
                </label>
                <input
                  id="create-expense-date"
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="create-expense-description" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Description / Vendor Details
                </label>
                <textarea
                  id="create-expense-description"
                  name="description"
                  rows={2}
                  placeholder="Optional details or vendor reference..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
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
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-rose-600/25"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-rose-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-700 dark:text-rose-300">
                  ✏️
                </div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">Edit Expense Entry</h2>
              </div>
              <button
                onClick={() => setEditingExpense(null)}
                aria-label="Close modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="edit-expense-category" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Expense Category *
                </label>
                <input
                  id="edit-expense-category"
                  name="category"
                  type="text"
                  required
                  defaultValue={editingExpense.category}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-expense-amount" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Amount ({business.currency}) *
                </label>
                <input
                  id="edit-expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={editingExpense.amount}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-expense-date" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Date
                </label>
                <input
                  id="edit-expense-date"
                  name="date"
                  type="date"
                  defaultValue={new Date(editingExpense.createdAt).toISOString().split("T")[0]}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none font-mono shadow-xs"
                />
              </div>

              <div>
                <label htmlFor="edit-expense-description" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  id="edit-expense-description"
                  name="description"
                  rows={2}
                  defaultValue={editingExpense.description || ""}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-rose-500 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-rose-600/25"
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
