import { BusinessType } from "@prisma/client";
import { IndustryInsight } from "./industry";

export interface PeriodMetric {
  amount: number;
  count: number;
  formatted: string;
}

export interface BusinessSalesHealth {
  today: PeriodMetric;
  yesterday: PeriodMetric;
  dayGrowthPercent: number | null; // e.g. +15.5 or -20.0 (null if no baseline)
  thisWeek: PeriodMetric;
  lastWeek: PeriodMetric;
  weekGrowthPercent: number | null;
  thisMonth: PeriodMetric;
  lastMonth: PeriodMetric;
  monthGrowthPercent: number | null;
}

export interface BusinessExpensesHealth {
  today: PeriodMetric;
  thisMonth: PeriodMetric;
  lastMonth: PeriodMetric;
  monthGrowthPercent: number | null;
  topCategories: Array<{ category: string; amount: number; formatted: string; percentage: number }>;
}

export interface BusinessProfitHealth {
  revenue: number;
  revenueFormatted: string;
  expenses: number;
  expensesFormatted: string;
  estimatedNetProfit: number;
  estimatedNetProfitFormatted: string;
  estimatedMarginPercent: number | null; // null if revenue is 0
}

export interface InventoryItemSummary {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  lowStockThreshold: number;
  sellingPriceFormatted: string;
}

export interface BusinessInventoryHealth {
  totalProducts: number;
  lowStockCount: number;
  zeroStockCount: number;
  lowStockItems: InventoryItemSummary[];
  zeroStockItems: InventoryItemSummary[];
  topSellingProducts: Array<{
    id: string;
    name: string;
    sku: string;
    unitsSold: number;
    revenue: number;
    revenueFormatted: string;
  }>;
}

export interface CustomerHealthSummary {
  totalCustomers: number;
  topCustomers: Array<{
    id: string;
    name: string;
    orderCount: number;
    totalSpent: number;
    totalSpentFormatted: string;
  }>;
  customersWithBalances: Array<{
    id: string;
    name: string;
    unpaidInvoiceCount: number;
    totalOwed: number;
    totalOwedFormatted: string;
  }>;
}

export interface OverdueInvoiceSummary {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  total: number;
  totalFormatted: string;
  dueDate: string;
  daysOverdue: number;
}

export interface BusinessInvoicesHealth {
  unpaidCount: number;
  overdueCount: number;
  outstandingAmount: number;
  outstandingAmountFormatted: string;
  overdueInvoices: OverdueInvoiceSummary[];
}

export interface BusinessHealthMetrics {
  businessId: string;
  businessName: string;
  currency: string;
  businessType: BusinessType;
  sales: BusinessSalesHealth;
  expenses: BusinessExpensesHealth;
  profit: BusinessProfitHealth;
  inventory: BusinessInventoryHealth;
  customers: CustomerHealthSummary;
  invoices: BusinessInvoicesHealth;
}

export type NeedsAttentionType =
  | "ZERO_STOCK"
  | "LOW_STOCK"
  | "OVERDUE_INVOICE"
  | "UNPAID_INVOICE"
  | "SALES_DECLINE"
  | "EXPENSE_SPIKE"
  | "UNUSUAL_PRODUCT_PERFORMANCE";

export type AttentionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface NeedsAttentionItem {
  id: string;
  type: NeedsAttentionType;
  severity: AttentionSeverity;
  title: string;
  explanation: string;
  entityType?: "PRODUCT" | "INVOICE" | "CUSTOMER" | "EXPENSE" | "SALES";
  entityId?: string;
  entityName?: string;
  recommendedAction: string;
  data: Record<string, unknown>;
}

export interface BusinessRecommendation {
  id: string;
  category: "INVENTORY" | "CASH_FLOW" | "SALES" | "EXPENSES" | "OPERATIONS";
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  action: string;
  rationale: string;
  entityId?: string;
  entityName?: string;
}

export interface BusinessBrainContext {
  businessId: string;
  businessName: string;
  currency: string;
  businessType?: BusinessType;
}

export interface BusinessBrief {
  businessId: string;
  businessName: string;
  currency: string;
  businessType: BusinessType;
  generatedAt: string;
  headline: string;
  health: BusinessHealthMetrics;
  attention: NeedsAttentionItem[];
  industryInsights: IndustryInsight[];
  recommendations: BusinessRecommendation[];
  formattedSummary: string;
}

