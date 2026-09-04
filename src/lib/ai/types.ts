import { Role } from "@/types/auth";
import { PaymentMethod, InvoiceStatus, CreditStatus } from "@prisma/client";

export type RoleType = Role;

export interface ActionPreviewData {
  actionType: "CREATE_INVOICE" | "CREATE_SALE" | "CREATE_EXPENSE";
  token: string;
  currency: string;
  preview: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  toolCalls?: {
    toolName: string;
    params: Record<string, unknown>;
    result?: unknown;
  }[];
  actionPreview?: ActionPreviewData;
  actionStatus?: "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "ERROR";
  actionResult?: string;
}

export interface AuthenticatedAIContext {
  userId: string;
  businessId: string;
  businessName: string;
  currency: string;
  role: Role;
  timezone?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: string;
  executionMs: number;
}

// Tool Parameter Interfaces
export interface BusinessSummaryParams {
  businessId?: string; // Must be verified and overridden server-side
}

export interface SalesQueryParams {
  businessId?: string;
  startDate?: string;
  endDate?: string;
  datePhrase?: string; // "today", "yesterday", "this_week", "this_month", "last_month", "last_30_days"
  customerId?: string;
  customerName?: string;
  paymentMethod?: PaymentMethod;
  limit?: number;
  page?: number;
}

export interface TopProductsParams {
  businessId?: string;
  startDate?: string;
  endDate?: string;
  datePhrase?: string;
  limit?: number;
}

export interface LowStockParams {
  businessId?: string;
  limit?: number;
}

export interface CustomersQueryParams {
  businessId?: string;
  search?: string;
  limit?: number;
  page?: number;
}

export interface CustomerSummaryParams {
  businessId?: string;
  customerId?: string;
  customerName?: string;
  phone?: string;
}

export interface ExpensesQueryParams {
  businessId?: string;
  startDate?: string;
  endDate?: string;
  datePhrase?: string;
  category?: string;
  limit?: number;
  page?: number;
}

export interface InvoicesQueryParams {
  businessId?: string;
  status?: InvoiceStatus;
  startDate?: string;
  endDate?: string;
  datePhrase?: string;
  customerId?: string;
  limit?: number;
  page?: number;
}

export interface ProductQueryParams {
  businessId?: string;
  productId?: string;
  sku?: string;
  barcode?: string;
  name?: string;
}

export interface DebtorsQueryParams {
  businessId?: string;
  limit?: number;
  onlyOverdue?: boolean;
}

export interface CreditSalesQueryParams {
  businessId?: string;
  status?: CreditStatus;
  customerName?: string;
  datePhrase?: string;
  limit?: number;
}

export interface CustomerDebtParams {
  businessId?: string;
  customerName?: string;
  customerId?: string;
  phone?: string;
}
