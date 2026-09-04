"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Role } from "@/types/auth";
import { PaymentMethod, SaleStatus, CreditStatus } from "@prisma/client";
import {
  createSaleAction,
  cancelSaleAction,
  recordCreditPaymentAction,
  CreditPaymentRecord,
} from "@/lib/actions/sales";
import DebtorReminderModal from "@/components/debtor-reminder-modal";

export interface SaleRecord {
  id: string;
  totalAmount: string;
  amountPaid: string;
  outstandingBalance: string;
  isCredit: boolean;
  creditStatus: CreditStatus | null;
  creditDueDate: string | null;
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
  creditPayments?: CreditPaymentRecord[];
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
  const [checkoutMode, setCheckoutMode] = useState<"PAY_NOW" | "CREDIT">("PAY_NOW");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [saleStatus, setSaleStatus] = useState<SaleStatus>("COMPLETED");

  // Credit Specific POS State
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [initialDeposit, setInitialDeposit] = useState<string>("0");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CASH");

  // Cart items
  const [saleItems, setSaleItems] = useState<
    { productId: string; quantity: number; unitPrice: number }[]
  >([]);

  // Receipt / Detail View State
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

  // Repayment Modal State
  const [repayingSale, setRepayingSale] = useState<SaleRecord | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState<string>("");
  const [repaymentMethod, setRepaymentMethod] = useState<PaymentMethod>("CASH");
  const [repaymentNote, setRepaymentNote] = useState<string>("");

  // Debtor Reminder Modal State
  const [remindingSale, setRemindingSale] = useState<{
    customerId: string;
    customerName: string;
    saleId: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<{ message?: string; error?: string } | null>(null);

  const canCancel = role === "OWNER" || role === "ADMIN";

  // Filter Sales list
  const filteredSales = sales.filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (s.customer && s.customer.name.toLowerCase().includes(term)) ||
      s.id.toLowerCase().includes(term) ||
      s.items.some((i) => i.productName.toLowerCase().includes(term));

    const matchesPayment =
      paymentFilter === "ALL" ||
      (paymentFilter === "CREDIT" ? s.isCredit : s.paymentMethod === paymentFilter);

    const matchesStatus =
      statusFilter === "ALL" ||
      s.status === statusFilter ||
      (s.creditStatus && s.creditStatus === statusFilter);

    return matchesSearch && matchesPayment && matchesStatus;
  });

  // Calculate live total for new sale
  const newSaleTotal = saleItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  const depositNum = Math.max(0, parseFloat(initialDeposit) || 0);
  const liveOutstanding = Math.max(0, newSaleTotal - depositNum);

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

  const handleSetDueDatePreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setCreditDueDate(d.toISOString().split("T")[0]);
  };

  const handleCreateSale = () => {
    if (saleItems.length === 0) {
      setFeedback({ error: "Please add at least one product to the sale." });
      return;
    }

    if (checkoutMode === "CREDIT") {
      if (!selectedCustomerId) {
        setFeedback({ error: "Please select a customer for this credit sale." });
        return;
      }
      if (!creditDueDate) {
        setFeedback({ error: "Please select a payment due date for the credit sale." });
        return;
      }
      if (depositNum > newSaleTotal) {
        setFeedback({ error: "Initial deposit cannot exceed total sale amount." });
        return;
      }
    }

    setFeedback(null);
    startTransition(async () => {
      const isCredit = checkoutMode === "CREDIT";

      const res = await createSaleAction(business.id, {
        customerId: selectedCustomerId || null,
        paymentMethod: isCredit ? "CREDIT" : paymentMethod,
        status: saleStatus,
        isCredit,
        creditDueDate: isCredit ? creditDueDate : null,
        initialPaymentAmount: isCredit ? depositNum : null,
        initialPaymentMethod: isCredit ? depositMethod : null,
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
        setInitialDeposit("0");
        setCheckoutMode("PAY_NOW");
        router.refresh();
      }
    });
  };

  const handleOpenRepaymentModal = (sale: SaleRecord) => {
    setRepayingSale(sale);
    setRepaymentAmount(sale.outstandingBalance);
    setRepaymentMethod("CASH");
    setRepaymentNote("");
    setFeedback(null);
  };

  const handleRecordRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingSale) return;

    const amountNum = parseFloat(repaymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFeedback({ error: "Please enter a valid repayment amount greater than 0." });
      return;
    }

    const outstandingNum = parseFloat(repayingSale.outstandingBalance);
    if (amountNum > outstandingNum) {
      setFeedback({
        error: `Repayment amount (${formatMoney(amountNum, business.currency)}) cannot exceed outstanding debt (${formatMoney(outstandingNum, business.currency)}).`,
      });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await recordCreditPaymentAction(business.id, repayingSale.id, {
        amount: amountNum,
        paymentMethod: repaymentMethod,
        note: repaymentNote,
      });

      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ message: res.message });
        setRepayingSale(null);
        router.refresh();
      }
    });
  };

  const handleCancelSale = (saleId: string) => {
    if (!confirm("Are you sure you want to void this sale? Products will be returned to inventory.")) return;

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

  const totalCreditDebt = sales
    .filter((s) => s.isCredit && s.status !== "CANCELLED" && s.status !== "REFUNDED")
    .reduce((sum, s) => sum + parseFloat(s.outstandingBalance), 0);

  const totalCreditSalesCount = sales.filter((s) => s.isCredit).length;

  return (
    <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 uppercase tracking-wide">
              POS Terminal & Debt Register
            </span>
            {totalCreditDebt > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                Outstanding Debt: {formatMoney(totalCreditDebt, business.currency)}
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Sales & Credit Register
          </h1>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400">
            Process checkout transactions, sell on credit, and manage customer installment debt balances
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setIsNewSaleOpen(true);
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 dark:shadow-[0_0_25px_-5px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto border border-violet-300/30"
        >
          <svg className="w-4 h-4 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Open POS Register</span>
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

      {/* Filter & Search Bar */}
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
            placeholder="Search sales by receipt #, customer name, or item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] focus:border-violet-500 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-violet-500 focus:outline-none transition cursor-pointer shadow-xs"
          >
            <option value="ALL">All Payment Types</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="TRANSFER">Bank Transfer</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="CREDIT">Credit (Debt)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-[#060a1a] border border-slate-300 dark:border-white/[0.08] rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-violet-500 focus:outline-none transition cursor-pointer shadow-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="UNPAID">Credit: Unpaid</option>
            <option value="PARTIALLY_PAID">Credit: Partially Paid</option>
            <option value="PAID">Credit: Fully Settled</option>
            <option value="OVERDUE">Credit: Overdue</option>
            <option value="CANCELLED">Cancelled / Refunded</option>
          </select>
        </div>
      </div>

      {/* Sales History Table */}
      <div className="bg-white/90 dark:bg-[#090e24]/70 border border-slate-200/90 dark:border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl shadow-md dark:shadow-xl">
        {filteredSales.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center mx-auto text-xl text-slate-400">
              🛒
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">No sales transactions found</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Click &quot;Open POS Register&quot; to ring up a cash or credit transaction.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#060918]/80 border-b border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Receipt ID</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Type / Method</th>
                  <th className="py-3.5 px-4">Date / Due</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Total / Balance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-slate-700 dark:text-slate-300">
                {filteredSales.map((sale) => {
                  const isOverdue =
                    sale.isCredit &&
                    parseFloat(sale.outstandingBalance) > 0 &&
                    sale.creditDueDate &&
                    new Date(sale.creditDueDate) < new Date();

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-600 dark:text-cyan-300">
                        #{sale.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {sale.customer ? sale.customer.name : "Walk-in Customer"}
                        </span>
                        {sale.customer?.phone && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {sale.customer.phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {sale.isCredit ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                            Credit Sale
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]">
                            {sale.paymentMethod}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        <div>
                          {new Date(sale.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        {sale.isCredit && sale.creditDueDate && (
                          <div className={`text-[10px] ${isOverdue ? "text-rose-600 dark:text-rose-400 font-bold" : "text-slate-500 dark:text-slate-400"}`}>
                            Due: {new Date(sale.creditDueDate).toLocaleDateString("en-GB")}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {sale.isCredit ? (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              sale.creditStatus === "PAID"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : isOverdue || sale.creditStatus === "OVERDUE"
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 animate-pulse"
                                : sale.creditStatus === "PARTIALLY_PAID"
                                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {isOverdue && sale.creditStatus !== "PAID"
                              ? "OVERDUE"
                              : sale.creditStatus || "CREDIT"}
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              sale.status === "COMPLETED"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {sale.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-black text-slate-900 dark:text-white font-mono text-sm">
                          {formatMoney(sale.totalAmount, business.currency)}
                        </div>
                        {sale.isCredit && (
                          <div className="text-[11px] font-mono">
                            {parseFloat(sale.outstandingBalance) > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">
                                Bal: {formatMoney(sale.outstandingBalance, business.currency)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Settled</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {sale.isCredit && parseFloat(sale.outstandingBalance) > 0 && sale.status !== "CANCELLED" && sale.customer && (
                          <button
                            type="button"
                            onClick={() =>
                              setRemindingSale({
                                customerId: sale.customer!.id,
                                customerName: sale.customer!.name,
                                saleId: sale.id,
                              })
                            }
                            title={`Send Payment Reminder to ${sale.customer.name}`}
                            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 transition cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          >
                            <span>💬</span>
                            <span>Remind</span>
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedSale(sale)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-cyan-50 dark:bg-white/[0.04] dark:hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 rounded-lg text-xs font-semibold border border-slate-200 dark:border-white/[0.08] hover:border-cyan-500/30 transition cursor-pointer shadow-xs"
                        >
                          Receipt
                        </button>
                        {sale.isCredit && parseFloat(sale.outstandingBalance) > 0 && sale.status !== "CANCELLED" && (
                          <button
                            onClick={() => handleOpenRepaymentModal(sale)}
                            className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-950/20 cursor-pointer"
                          >
                            Repay
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

      {/* POS Checkout Terminal Modal */}
      {isNewSaleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-violet-500/30 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-700 dark:text-violet-300">
                  ⚡
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">POS Checkout Terminal</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Ring up products and record instant or credit transactions</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewSaleOpen(false)}
                aria-label="Close terminal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Checkout Mode Toggle: PAY NOW vs SELL ON CREDIT */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#050816] rounded-2xl border border-slate-200 dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setCheckoutMode("PAY_NOW")}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  checkoutMode === "PAY_NOW"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-violet-400/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>💳 Pay Now (Instant Settlement)</span>
              </button>

              <button
                type="button"
                onClick={() => setCheckoutMode("CREDIT")}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  checkoutMode === "CREDIT"
                    ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/20 border border-amber-400/30"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span>📜 Sell on Credit (Customer Debt)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Product Catalog Matrix (Left 7 Cols) */}
              <div className="lg:col-span-7 space-y-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Select Products from Catalog:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddProductToSale(p.id)}
                      disabled={p.stockQuantity <= 0}
                      className="p-3 bg-slate-50 dark:bg-[#050816] hover:bg-violet-50 dark:hover:bg-violet-950/20 border border-slate-200 dark:border-white/[0.08] hover:border-violet-500/40 rounded-2xl text-left transition flex flex-col justify-between cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group shadow-xs"
                    >
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block group-hover:text-indigo-600 dark:group-hover:text-cyan-300 transition truncate">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block">SKU: {p.sku}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatMoney(p.sellingPrice, business.currency)}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-200/70 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 font-mono">
                          {p.stockQuantity} in stock
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart Drawer & Payment Breakdown (Right 5 Cols) */}
              <div className="lg:col-span-5 bg-slate-50 dark:bg-[#050816] border border-slate-200 dark:border-white/[0.08] rounded-2xl p-4 space-y-3.5 flex flex-col justify-between shadow-xs">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.06]">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Cart Summary</span>
                    <span className="text-xs font-mono text-cyan-600 dark:text-cyan-300 font-bold">{saleItems.length} items</span>
                  </div>

                  {saleItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      Click products to add to cart
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {saleItems.map((item, idx) => {
                        const product = products.find((p) => p.id === item.productId);
                        return (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white dark:bg-[#090d24] p-2 rounded-xl border border-slate-200 dark:border-white/[0.04] shadow-xs">
                            <div className="truncate pr-2">
                              <span className="font-bold text-slate-900 dark:text-white block truncate">{product?.name}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {formatMoney(item.unitPrice, business.currency)} each
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQty(idx, parseInt(e.target.value) || 0)}
                                aria-label={`Quantity for ${product?.name}`}
                                className="w-12 px-1.5 py-0.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] rounded text-center text-xs text-slate-900 dark:text-white font-mono"
                              />
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                aria-label="Remove item"
                                className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 text-xs px-1 cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Customer Selection */}
                  <div>
                    <label htmlFor="customer-pos-select" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Customer {checkoutMode === "CREDIT" ? <span className="text-amber-600 dark:text-amber-400">* (Required for Credit)</span> : "(Optional)"}
                    </label>
                    <select
                      id="customer-pos-select"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      required={checkoutMode === "CREDIT"}
                      aria-label="Select Customer"
                      className={`w-full px-3 py-2 bg-white dark:bg-[#090d24] border rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none transition cursor-pointer shadow-xs ${
                        checkoutMode === "CREDIT" && !selectedCustomerId
                          ? "border-amber-500 ring-1 ring-amber-500/30"
                          : "border-slate-300 dark:border-white/[0.1]"
                      }`}
                    >
                      <option value="">-- Choose Customer --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white dark:bg-[#090d24] text-slate-900 dark:text-white">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Conditional Payment Controls */}
                  {checkoutMode === "PAY_NOW" ? (
                    <div>
                      <label htmlFor="pos-payment-method" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                        Settlement Method *
                      </label>
                      <select
                        id="pos-payment-method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        aria-label="Settlement Method"
                        className="w-full px-3 py-2 bg-white dark:bg-[#090d24] border border-slate-300 dark:border-white/[0.1] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none transition cursor-pointer shadow-xs"
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Debit / Credit Card (POS)</option>
                        <option value="TRANSFER">Bank Transfer</option>
                        <option value="MOBILE_MONEY">Mobile Money</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2.5 p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-500/30">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                            Repayment Due Date *
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetDueDatePreset(7)}
                              className="text-[9px] px-1.5 py-0.5 bg-white dark:bg-white/[0.05] hover:bg-amber-100 dark:hover:bg-amber-500/20 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                            >
                              +7d
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetDueDatePreset(14)}
                              className="text-[9px] px-1.5 py-0.5 bg-white dark:bg-white/[0.05] hover:bg-amber-100 dark:hover:bg-amber-500/20 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                            >
                              +14d
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetDueDatePreset(30)}
                              className="text-[9px] px-1.5 py-0.5 bg-white dark:bg-white/[0.05] hover:bg-amber-100 dark:hover:bg-amber-500/20 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-white/[0.08] cursor-pointer"
                            >
                              +30d
                            </button>
                          </div>
                        </div>
                        <input
                          type="date"
                          required
                          value={creditDueDate}
                          onChange={(e) => setCreditDueDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-[#090d24] border border-slate-300 dark:border-white/[0.1] rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none shadow-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                            Initial Deposit (₦)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={initialDeposit}
                            onChange={(e) => setInitialDeposit(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white dark:bg-[#090d24] border border-slate-300 dark:border-white/[0.1] rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none shadow-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                            Deposit Method
                          </label>
                          <select
                            value={depositMethod}
                            onChange={(e) => setDepositMethod(e.target.value as PaymentMethod)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-[#090d24] border border-slate-300 dark:border-white/[0.1] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none shadow-xs"
                          >
                            <option value="CASH">Cash</option>
                            <option value="TRANSFER">Transfer</option>
                            <option value="CARD">Card</option>
                            <option value="MOBILE_MONEY">Mobile Money</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Amount Summaries */}
                <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Total Order:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {formatMoney(newSaleTotal, business.currency)}
                    </span>
                  </div>

                  {checkoutMode === "CREDIT" && (
                    <>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Deposit Paid:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatMoney(depositNum, business.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-amber-700 dark:text-amber-300 font-bold pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                        <span>Customer Debt:</span>
                        <span className="font-mono text-sm">
                          {formatMoney(liveOutstanding, business.currency)}
                        </span>
                      </div>
                    </>
                  )}

                  <button
                    onClick={handleCreateSale}
                    disabled={isPending || saleItems.length === 0}
                    className={`w-full py-3 mt-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      checkoutMode === "CREDIT"
                        ? "bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-amber-600/20"
                        : "bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-indigo-600/25"
                    }`}
                  >
                    {isPending
                      ? "Recording..."
                      : checkoutMode === "CREDIT"
                      ? `Record Credit Sale (${formatMoney(newSaleTotal, business.currency)})`
                      : `Complete Sale (${formatMoney(newSaleTotal, business.currency)})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {repayingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-emerald-500/30 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                  💵
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Record Debt Repayment</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Receipt #{repayingSale.id.slice(-6).toUpperCase()} • {repayingSale.customer?.name || "Customer"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRepayingSale(null)}
                aria-label="Close repayment modal"
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Debt Overview Card */}
            <div className="p-4 bg-slate-50 dark:bg-[#050816] rounded-2xl border border-slate-200 dark:border-white/[0.08] space-y-2 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Original Total:</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">
                  {formatMoney(repayingSale.totalAmount, business.currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Total Paid So Far:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {formatMoney(repayingSale.amountPaid, business.currency)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black text-rose-600 dark:text-rose-400 pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                <span>Current Outstanding Debt:</span>
                <span className="font-mono">
                  {formatMoney(repayingSale.outstandingBalance, business.currency)}
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordRepayment} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Repayment Amount ({business.currency}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={repayingSale.outstandingBalance}
                  required
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-emerald-500 rounded-xl text-slate-900 dark:text-white text-xs font-mono focus:outline-none shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Payment Method *
                </label>
                <select
                  value={repaymentMethod}
                  onChange={(e) => setRepaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-emerald-500 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none cursor-pointer shadow-xs"
                >
                  <option value="CASH">Cash</option>
                  <option value="TRANSFER">Bank Transfer</option>
                  <option value="CARD">Debit / POS Card</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Repayment Note / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank transfer ref, cash installment"
                  value={repaymentNote}
                  onChange={(e) => setRepaymentNote(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#050816] border border-slate-300 dark:border-white/[0.1] focus:border-emerald-500 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none shadow-xs"
                />
              </div>

              {/* Installments History */}
              {repayingSale.creditPayments && repayingSale.creditPayments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Previous Installments ({repayingSale.creditPayments.length}):
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {repayingSale.creditPayments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.04]">
                        <div>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                            +{formatMoney(p.amount, business.currency)}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 ml-2 text-[10px]">({p.paymentMethod})</span>
                        </div>
                        <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                          {new Date(p.createdAt).toLocaleDateString("en-GB")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setRepayingSale(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-950/20"
                >
                  {isPending ? "Recording Repayment..." : "Confirm Repayment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Detail / Printable Receipt Modal */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-white dark:bg-[#090d24] border border-slate-200 dark:border-cyan-500/30 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center pb-3 border-b border-slate-200 dark:border-white/[0.08]">
              <h3 className="font-black text-lg text-slate-900 dark:text-white">{business.name}</h3>
              <p className="text-xs text-cyan-600 dark:text-cyan-300 font-mono">Receipt #{selectedSale.id.slice(-6).toUpperCase()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {new Date(selectedSale.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {/* Customer & Type Info */}
            <div className="p-3 bg-slate-50 dark:bg-[#050816] rounded-2xl border border-slate-200 dark:border-white/[0.08] text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Customer:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedSale.customer ? selectedSale.customer.name : "Walk-in"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sale Type:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedSale.isCredit ? "Credit Sale" : selectedSale.paymentMethod}</span>
              </div>
              {selectedSale.isCredit && selectedSale.creditDueDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Payment Due Date:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-300">
                    {new Date(selectedSale.creditDueDate).toLocaleDateString("en-GB")}
                  </span>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Items Purchased:</span>
              <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {selectedSale.items.map((item) => (
                  <div key={item.id} className="py-2 flex justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{item.productName}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {item.quantity} × {formatMoney(item.unitPrice, business.currency)}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {formatMoney(item.totalAmount, business.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals & Debt Summary */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Grand Total:</span>
                <span className="font-black text-slate-900 dark:text-white font-mono text-sm">
                  {formatMoney(selectedSale.totalAmount, business.currency)}
                </span>
              </div>
              {selectedSale.isCredit && (
                <>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Total Amount Paid:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatMoney(selectedSale.amountPaid, business.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-700 dark:text-amber-300 font-bold pt-1 border-t border-slate-200 dark:border-white/[0.04]">
                    <span>Outstanding Debt Balance:</span>
                    <span className="font-mono text-sm">
                      {formatMoney(selectedSale.outstandingBalance, business.currency)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Installments Breakdown if any */}
            {selectedSale.creditPayments && selectedSale.creditPayments.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Repayments Log ({selectedSale.creditPayments.length}):
                </span>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {selectedSale.creditPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-50 dark:bg-[#050816] rounded-xl border border-slate-200 dark:border-white/[0.04]">
                      <div>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          +{formatMoney(p.amount, business.currency)}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 ml-2 text-[10px]">({p.paymentMethod})</span>
                      </div>
                      <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                        {new Date(p.createdAt).toLocaleDateString("en-GB")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center gap-2 pt-3 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                {canCancel && selectedSale.status !== "CANCELLED" && selectedSale.status !== "REFUNDED" && (
                  <button
                    onClick={() => handleCancelSale(selectedSale.id)}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold border border-rose-500/30 transition cursor-pointer"
                  >
                    Void Sale
                  </button>
                )}
                {selectedSale.isCredit && parseFloat(selectedSale.outstandingBalance) > 0 && selectedSale.status !== "CANCELLED" && selectedSale.customer && (
                  <button
                    type="button"
                    onClick={() => {
                      const s = selectedSale;
                      setSelectedSale(null);
                      setRemindingSale({
                        customerId: s.customer!.id,
                        customerName: s.customer!.name,
                        saleId: s.id,
                      });
                    }}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                  >
                    <span>💬</span>
                    <span>Remind Debtor</span>
                  </button>
                )}
                {selectedSale.isCredit && parseFloat(selectedSale.outstandingBalance) > 0 && selectedSale.status !== "CANCELLED" && (
                  <button
                    onClick={() => {
                      const s = selectedSale;
                      setSelectedSale(null);
                      handleOpenRepaymentModal(s);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                  >
                    Record Repayment
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedSale(null)}
                className="px-4 py-1.5 bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debtor Reminder Modal */}
      {remindingSale && (
        <DebtorReminderModal
          businessId={business.id}
          currency={business.currency}
          customerId={remindingSale.customerId}
          customerName={remindingSale.customerName}
          saleId={remindingSale.saleId}
          isOpen={Boolean(remindingSale)}
          onClose={() => setRemindingSale(null)}
          onSuccess={(msg) => {
            setFeedback({ message: msg });
            setRemindingSale(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

