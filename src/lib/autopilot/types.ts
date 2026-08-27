export type AutopilotEventType =
  | "ZERO_STOCK"
  | "LOW_STOCK"
  | "TOP_PRODUCT_STOCKOUT"
  | "OVERDUE_INVOICE"
  | "LARGE_OUTSTANDING_BALANCE"
  | "SALES_DECLINE"
  | "SALES_SURGE"
  | "EXPENSE_SPIKE"
  | "TOP_PRODUCT_SURGE"
  | "CUSTOMER_RETENTION_OPPORTUNITY"
  | "REORDER_OPPORTUNITY"
  | "INDUSTRY_ALERT";

export type AutopilotSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AutopilotEvent {
  id: string;
  businessId: string;
  type: AutopilotEventType;
  severity: AutopilotSeverity;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  recommendedAction: string;
  dedupKey: string;
  createdAt: string;
  expiresAt: string;
}

export interface BusinessOpportunity {
  id: string;
  title: string;
  category: "SALES_GROWTH" | "CUSTOMER_EXPANSION" | "PRODUCT_EXPANSION" | "MARGIN_OPTIMIZATION";
  explanation: string;
  evidence: string;
  recommendedNextStep: string;
  metrics: Record<string, unknown>;
}

export interface DailyActionItem {
  priority: number;
  severity: AutopilotSeverity;
  badge: "🔴" | "🟠" | "🟡" | "🟢";
  title: string;
  action: string;
  evidence: string;
  category: string;
  relatedEntityId?: string;
  suggestedPrompt?: string;
}

export interface DailyActionPlan {
  businessId: string;
  businessName: string;
  businessType: string;
  date: string;
  headline: string;
  totalActions: number;
  actions: DailyActionItem[];
  formattedSummary: string;
}

export interface MorningBrief {
  businessId: string;
  businessName: string;
  currency: string;
  businessType: string;
  date: string;
  financialSnapshot: {
    salesTodayFormatted: string;
    salesThisMonthFormatted: string;
    salesGrowthFormatted?: string;
    expensesThisMonthFormatted: string;
    estimatedNetProfitFormatted: string;
    unpaidInvoicesFormatted: string;
    inventorySummary: string;
  };
  threeThingsToKnow: string[];
  todayPriorities: string[];
  topOpportunity: string | null;
  formattedMessage: string;
}
