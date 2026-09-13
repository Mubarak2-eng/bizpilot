import {
  AuthenticatedAIContext,
  ChatMessage,
  ToolExecutionResult,
} from "./types";
import {
  BIZPILOT_AI_TOOLS,
  get_business_brief,
  get_business_summary,
  get_customer_summary,
  get_customers,
  get_daily_action_plan,
  get_expenses,
  get_invoices,
  get_low_stock_products,
  get_morning_brief,
  get_needs_attention,
  get_product,
  get_sales,
  get_top_products,
  get_debtors,
  get_credit_sales,
  get_customer_debt,
} from "./tools";
import {
  draft_invoice,
  DraftInvoiceParams,
  prepare_expense,
  PrepareExpenseParams,
  prepare_sale,
  PrepareSaleParams,
  prepare_product,
  prepare_customer,
} from "./action-tools";
import { PrepareProductParams, PrepareCustomerParams } from "./types";
import { getAIProvider } from "./provider";
import { checkAndIncrementAIQuota } from "../subscriptions/quotas";

export interface AIExecutionResponse {
  message: ChatMessage;
  toolResults?: ToolExecutionResult[];
  providerUsed: string;
  requestId: string;
}

/**
 * Executes a tool function securely against the verified business context.
 */
export async function executeToolCall(
  toolName: string,
  rawParams: Record<string, unknown>,
  context: AuthenticatedAIContext,
  requestId: string
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // Enforce server-side trusted businessId
  const params = {
    ...rawParams,
    businessId: context.businessId,
  };

  try {
    let resultData: unknown = null;

    switch (toolName) {
      case "get_daily_action_plan":
        resultData = await get_daily_action_plan(params, context);
        break;

      case "get_morning_brief":
        resultData = await get_morning_brief(params, context);
        break;

      case "get_business_brief":
        resultData = await get_business_brief(params, context);
        break;

      case "get_needs_attention":
        resultData = await get_needs_attention(params, context);
        break;

      case "get_business_summary":
        resultData = await get_business_summary(params, context);
        break;

      case "get_sales":
        resultData = await get_sales(params, context);
        break;

      case "get_top_products":
        resultData = await get_top_products(params, context);
        break;

      case "get_low_stock_products":
        resultData = await get_low_stock_products(params, context);
        break;

      case "get_customers":
        resultData = await get_customers(params, context);
        break;

      case "get_customer_summary":
        resultData = await get_customer_summary(params, context);
        break;

      case "get_expenses":
        resultData = await get_expenses(params, context);
        break;

      case "get_invoices":
        resultData = await get_invoices(params, context);
        break;

      case "get_product":
        resultData = await get_product(params, context);
        break;

      case "get_debtors":
        resultData = await get_debtors(params, context);
        break;

      case "get_credit_sales":
        resultData = await get_credit_sales(params, context);
        break;

      case "get_customer_debt":
        resultData = await get_customer_debt(params, context);
        break;

      case "draft_invoice":
        resultData = await draft_invoice(params as unknown as DraftInvoiceParams, context);
        break;

      case "prepare_expense":
        resultData = await prepare_expense(params as unknown as PrepareExpenseParams, context);
        break;

      case "prepare_sale":
        resultData = await prepare_sale(params as unknown as PrepareSaleParams, context);
        break;

      case "prepare_product":
        resultData = await prepare_product(params as unknown as PrepareProductParams, context);
        break;

      case "prepare_customer":
        resultData = await prepare_customer(params as unknown as PrepareCustomerParams, context);
        break;

      default:
        throw new Error(`Tool "${toolName}" is not an authorized BizPilot AI tool.`);
    }

    const duration = Date.now() - startTime;

    // Observability Logging (safe: no passwords/secrets)
    console.log(
      `[AI Audit] reqId=${requestId} tool=${toolName} duration=${duration}ms status=SUCCESS bizId=${context.businessId}`
    );

    return {
      success: true,
      toolName,
      data: resultData,
      executionMs: duration,
    };
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Tool execution failed";

    console.error(
      `[AI Audit] reqId=${requestId} tool=${toolName} duration=${duration}ms status=FAILED error="${errorMessage}"`
    );

    return {
      success: false,
      toolName,
      error: errorMessage,
      executionMs: duration,
    };
  }
}

/**
 * Main AI Assistant processor.
 */
export async function runAIAssistant(
  conversationHistory: ChatMessage[],
  newMessageText: string,
  context: AuthenticatedAIContext
): Promise<AIExecutionResponse> {
  const requestId = `ai-req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: "user",
    content: newMessageText.trim(),
    timestamp: new Date().toISOString(),
  };

  // Enforce monthly AI usage quota per business
  const quotaCheck = await checkAndIncrementAIQuota(context.businessId);
  if (!quotaCheck.allowed) {
    const quotaMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: "assistant",
      content:
        quotaCheck.message ||
        `You've reached your monthly limit of ${quotaCheck.limit} AI queries for this business.\n\nUpgrade your plan to continue using BizPilot AI.`,
      timestamp: new Date().toISOString(),
    };
    return {
      message: quotaMessage,
      providerUsed: "quota_enforcer",
      requestId,
    };
  }

  const fullHistory: ChatMessage[] = [...conversationHistory, userMessage];

  // Resolve provider
  const provider = getAIProvider();

  // Generate initial tool calls or response
  const aiResponse = await provider.generateResponse(
    fullHistory,
    context,
    BIZPILOT_AI_TOOLS
  );

  const toolResults: ToolExecutionResult[] = [];

  // Execute any tools selected by the AI
  if (aiResponse.toolCalls && aiResponse.toolCalls.length > 0) {
    for (const tc of aiResponse.toolCalls) {
      const result = await executeToolCall(tc.toolName, tc.params, context, requestId);
      toolResults.push(result);
    }
  }

  // Synthesize concise, business-copilot assistant message
  let finalContent = aiResponse.content;

  if (toolResults.length > 0) {
    finalContent = formatToolResultsSummary(aiResponse.content, toolResults, context);
  }

  // Check if any tool produced an action preview
  let actionPreviewData = undefined;
  for (const tr of toolResults) {
    if (tr.success && tr.data && typeof tr.data === "object" && "isActionPreview" in tr.data) {
      const d = tr.data as {
        isActionPreview: boolean;
        actionType: "CREATE_INVOICE" | "CREATE_SALE" | "CREATE_EXPENSE";
        token: string;
        currency: string;
        preview: Record<string, unknown>;
      };
      actionPreviewData = {
        actionType: d.actionType,
        token: d.token,
        currency: d.currency,
        preview: d.preview,
      };
      break;
    }
  }

  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: "assistant",
    content: finalContent,
    timestamp: new Date().toISOString(),
    toolCalls: toolResults.map((tr) => ({
      toolName: tr.toolName,
      params: {},
      result: tr.data,
    })),
    actionPreview: actionPreviewData,
    actionStatus: actionPreviewData ? "PENDING" : undefined,
  };

  return {
    message: assistantMessage,
    toolResults,
    providerUsed: provider.name,
    requestId,
  };
}

/**
 * Formats tool results cleanly into natural language for the business user.
 */
function formatToolResultsSummary(
  prefix: string,
  toolResults: ToolExecutionResult[],
  context: AuthenticatedAIContext
): string {
  const parts: string[] = [];

  if (prefix && prefix.trim().length > 0) {
    parts.push(prefix.trim());
  }

  for (const tr of toolResults) {
    if (!tr.success) {
      parts.push(`⚠️ ${tr.error || "Could not retrieve data."}`);
      continue;
    }

    const data = tr.data as Record<string, unknown>;

    switch (tr.toolName) {
      case "get_daily_action_plan": {
        const planData = data as { data?: { formattedSummary?: string }; formattedSummary?: string };
        const text = planData.formattedSummary || planData.data?.formattedSummary || "Here is your Daily Action Plan.";
        parts.push(text);
        break;
      }

      case "get_morning_brief": {
        const briefData = data as { data?: { formattedMessage?: string }; formattedMessage?: string };
        const text = briefData.formattedMessage || briefData.data?.formattedMessage || "Here is your Morning Business Brief.";
        parts.push(text);
        break;
      }

      case "get_business_brief": {
        const briefData = data as { formatted?: string; data?: { formattedSummary?: string } };
        const text = briefData.formatted || briefData.data?.formattedSummary || "Here is your business brief.";
        parts.push(text);
        break;
      }

      case "get_needs_attention": {
        const attData = data as {
          data?: {
            attentionCount: number;
            items: Array<{ title: string; severity: string; recommendedAction: string }>;
            recommendations: Array<{ title: string; action: string }>;
          };
        };
        const items = attData.data?.items || [];
        const recs = attData.data?.recommendations || [];

        if (items.length === 0) {
          parts.push(`✅ **All Clear!** There are no urgent matters or operational risks requiring attention at this time.`);
        } else {
          const lines = [`### ⚠️ Matters Requiring Attention (${items.length})\n`];
          for (const item of items) {
            const icon = item.severity === "CRITICAL" ? "🔴" : item.severity === "HIGH" ? "🟠" : "🟡";
            lines.push(`${icon} **${item.title}**\n  ↳ ${item.recommendedAction}`);
          }
          if (recs.length > 0) {
            lines.push(`\n**💡 Recommended Actions**:`);
            for (let i = 0; i < Math.min(recs.length, 3); i++) {
              lines.push(`${i + 1}. **${recs[i].title}**: ${recs[i].action}`);
            }
          }
          parts.push(lines.join("\n"));
        }
        break;
      }

      case "get_business_summary": {
        const sum = data as {
          salesToday: { formatted: string; count: number };
          salesThisMonth: { formatted: string; count: number };
          totalSalesAllTime: { formatted: string };
          expensesThisMonth: { formatted: string };
          estimatedProfitThisMonth: { formatted: string };
          inventorySummary: { totalProducts: number; lowStockCount: number };
          customerCount: number;
          outstandingInvoices: { count: number; formatted: string };
        };
        parts.push(
          `### 📊 Business Overview for ${context.businessName}\n` +
            `- **Sales Today**: ${sum.salesToday.formatted} (${sum.salesToday.count} orders)\n` +
            `- **Sales This Month**: ${sum.salesThisMonth.formatted} (${sum.salesThisMonth.count} orders)\n` +
            `- **All-Time Sales**: ${sum.totalSalesAllTime.formatted}\n` +
            `- **Expenses This Month**: ${sum.expensesThisMonth.formatted}\n` +
            `- **Estimated Net Margin This Month**: **${sum.estimatedProfitThisMonth.formatted}**\n` +
            `- **Products in Catalog**: ${sum.inventorySummary.totalProducts} (${sum.inventorySummary.lowStockCount} low-stock)\n` +
            `- **Total Customers**: ${sum.customerCount}\n` +
            `- **Unpaid Invoices**: ${sum.outstandingInvoices.formatted} (${sum.outstandingInvoices.count} pending)`
        );
        break;
      }

      case "get_sales": {
        const salesData = data as {
          dateRangeDescription: string;
          totalRecords: number;
          formattedTotalAmount: string;
          sales: { date: string; customer: string; formattedAmount: string; paymentMethod: string; itemsSummary: string }[];
        };
        if (salesData.sales.length === 0) {
          parts.push(`No sales transactions recorded for **${salesData.dateRangeDescription}**.`);
        } else {
          parts.push(
            `### 🛒 Sales Summary (${salesData.dateRangeDescription})\n` +
              `Total Revenue: **${salesData.formattedTotalAmount}** across ${salesData.totalRecords} sale(s).\n\n` +
              salesData.sales
                .slice(0, 5)
                .map(
                  (s, i) =>
                    `${i + 1}. **${s.formattedAmount}** - ${s.customer} (${s.paymentMethod}, ${s.date}) — _${s.itemsSummary}_`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_top_products": {
        const topData = data as {
          dateRangeDescription: string;
          topProducts: { rank: number; name: string; sku: string; unitsSold: number; formattedRevenue: string; stockQuantity: number }[];
        };
        if (topData.topProducts.length === 0) {
          parts.push(`No product sales recorded for **${topData.dateRangeDescription}** yet.`);
        } else {
          parts.push(
            `### 🏆 Top-Selling Products (${topData.dateRangeDescription})\n` +
              topData.topProducts
                .map(
                  (p) =>
                    `${p.rank}. **${p.name}** (\`${p.sku}\`) — **${p.unitsSold} units sold** | Total Revenue: **${p.formattedRevenue}** (Stock: ${p.stockQuantity})`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_low_stock_products": {
        const lowData = data as {
          totalLowStockItems: number;
          lowStockProducts: { name: string; sku: string; stockQuantity: number; lowStockThreshold: number; sellingPrice: string; reorderNeeded: number }[];
        };
        if (lowData.lowStockProducts.length === 0) {
          parts.push(`✅ **All inventory levels are healthy!** No products are at or below low-stock thresholds.`);
        } else {
          parts.push(
            `### ⚠️ Low Stock Alert (${lowData.totalLowStockItems} items require replenishment)\n` +
              lowData.lowStockProducts
                .map(
                  (p) =>
                    `- **${p.name}** (\`${p.sku}\`): **${p.stockQuantity} units remaining** (Threshold: ${p.lowStockThreshold}) — _Suggested reorder: +${p.reorderNeeded} units_`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_customers": {
        const custData = data as {
          totalCustomers: number;
          customers: { name: string; phone: string | null; formattedLifetimeSpent: string; totalPurchasesCount: number }[];
        };
        if (custData.customers.length === 0) {
          parts.push(`No customer records found.`);
        } else {
          parts.push(
            `### 👥 Customer Directory (${custData.totalCustomers} total)\n` +
              custData.customers
                .map(
                  (c, i) =>
                    `${i + 1}. **${c.name}** ${c.phone ? `(${c.phone})` : ""} — Lifetime Spend: **${c.formattedLifetimeSpent}** (${c.totalPurchasesCount} purchases)`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_customer_summary": {
        const cust = data as {
          customer: { name: string; phone: string | null; email: string | null; address: string | null };
          formattedLifetimeSales: string;
          totalSalesCount: number;
          formattedOutstandingBalance: string;
          outstandingInvoicesCount: number;
          recentTransactions: { date: string; amount: string; status: string; items: string }[];
        };
        parts.push(
          `### 👤 Customer Profile: ${cust.customer.name}\n` +
            `- **Phone**: ${cust.customer.phone || "N/A"}\n` +
            `- **Email**: ${cust.customer.email || "N/A"}\n` +
            `- **Lifetime Purchases**: **${cust.formattedLifetimeSales}** (${cust.totalSalesCount} orders)\n` +
            `- **Unpaid Balance**: **${cust.formattedOutstandingBalance}** (${cust.outstandingInvoicesCount} open invoices)\n` +
            (cust.recentTransactions.length > 0
              ? `\n**Recent Activity:**\n` +
                cust.recentTransactions
                  .map((t) => `- ${t.date}: ${t.amount} (${t.status}) — ${t.items}`)
                  .join("\n")
              : "")
        );
        break;
      }

      case "get_expenses": {
        const expData = data as {
          dateRangeDescription: string;
          formattedTotalSpent: string;
          categoryBreakdown: { category: string; formattedAmount: string }[];
        };
        parts.push(
          `### 💸 Operating Expenses (${expData.dateRangeDescription})\n` +
            `Total Spending: **${expData.formattedTotalSpent}**\n\n` +
            (expData.categoryBreakdown.length > 0
              ? `**Category Breakdown:**\n` +
                expData.categoryBreakdown.map((c) => `- **${c.category}**: ${c.formattedAmount}`).join("\n")
              : "No expenses recorded for this period.")
        );
        break;
      }

      case "get_invoices": {
        const invData = data as {
          dateRangeDescription: string;
          totalInvoicesCount: number;
          formattedTotalAmount: string;
          formattedUnpaidAmount: string;
          statusCounts: Record<string, number>;
          invoices: { invoiceNumber: string; customer: string; formattedTotal: string; status: string; dueDate: string }[];
        };
        parts.push(
          `### 🧾 Invoices & Receivables (${invData.dateRangeDescription})\n` +
            `- **Total Invoiced**: ${invData.formattedTotalAmount} (${invData.totalInvoicesCount} invoices)\n` +
            `- **Outstanding Unpaid**: **${invData.formattedUnpaidAmount}**\n\n` +
            invData.invoices
              .slice(0, 5)
              .map((inv) => `- **${inv.invoiceNumber}** to ${inv.customer}: ${inv.formattedTotal} [${inv.status}] (Due: ${inv.dueDate})`)
              .join("\n")
        );
        break;
      }

      case "get_product": {
        const prod = data as {
          name: string;
          sku: string;
          formattedSellingPrice: string;
          formattedCostPrice: string;
          stockQuantity: number;
          lowStockThreshold: number;
          isLowStock: boolean;
          totalUnitsSold: number;
          totalRevenueGenerated: string;
        };
        parts.push(
          `### 📦 Product Information: ${prod.name}\n` +
            `- **SKU**: \`${prod.sku}\`\n` +
            `- **Price**: ${prod.formattedSellingPrice} (Cost: ${prod.formattedCostPrice})\n` +
            `- **In Stock**: **${prod.stockQuantity} units** (Threshold: ${prod.lowStockThreshold}) ${prod.isLowStock ? "⚠️ _LOW STOCK_" : "✅"}\n` +
            `- **All-Time Sold**: ${prod.totalUnitsSold} units (Revenue: ${prod.totalRevenueGenerated})`
        );
        break;
      }

      case "get_debtors": {
        const debtorsData = data as {
          totalDebtors: number;
          formattedTotalReceivables: string;
          formattedTotalOverdue: string;
          debtors: {
            customerName: string;
            phone: string | null;
            formattedTotalOutstandingDebt: string;
            formattedOverdueDebt: string;
            activeCreditSalesCount: number;
          }[];
        };

        if (debtorsData.debtors.length === 0) {
          parts.push(`🎉 **No outstanding customer debts!** All credit sales have been fully paid.`);
        } else {
          parts.push(
            `### 📜 Customer Debt Ledger & Receivables\n` +
              `- **Total Customers with Debt**: ${debtorsData.totalDebtors}\n` +
              `- **Total Outstanding Balance**: **${debtorsData.formattedTotalReceivables}**\n` +
              (debtorsData.formattedTotalOverdue !== "₦0.00" && debtorsData.formattedTotalOverdue !== "0.00"
                ? `- **Total Overdue Debt**: ⚠️ **${debtorsData.formattedTotalOverdue}**\n\n`
                : "\n") +
              `**Debtor Accounts:**\n` +
              debtorsData.debtors
                .slice(0, 10)
                .map(
                  (d, i) =>
                    `${i + 1}. **${d.customerName}** ${d.phone ? `(${d.phone})` : ""}: owes **${d.formattedTotalOutstandingDebt}** across ${d.activeCreditSalesCount} credit sale(s)`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_credit_sales": {
        const creditData = data as {
          dateRangeDescription: string;
          totalRecords: number;
          formattedTotalCreditGranted: string;
          formattedTotalCollected: string;
          formattedTotalOutstanding: string;
          sales: {
            receiptNumber: string;
            customer: string;
            formattedTotalAmount: string;
            formattedAmountPaid: string;
            formattedOutstandingBalance: string;
            creditStatus: string;
            creditDueDate: string | null;
            saleDate: string;
          }[];
        };

        if (creditData.sales.length === 0) {
          parts.push(`No credit sales recorded for **${creditData.dateRangeDescription}**.`);
        } else {
          parts.push(
            `### 📜 Credit Sales Transactions (${creditData.dateRangeDescription})\n` +
              `- **Total Credit Granted**: ${creditData.formattedTotalCreditGranted} (${creditData.totalRecords} sales)\n` +
              `- **Collected Down/Repayments**: ${creditData.formattedTotalCollected}\n` +
              `- **Total Outstanding Balance**: **${creditData.formattedTotalOutstanding}**\n\n` +
              `**Recent Credit Sales:**\n` +
              creditData.sales
                .slice(0, 5)
                .map(
                  (s, i) =>
                    `${i + 1}. **${s.receiptNumber}** - ${s.customer}: ${s.formattedTotalAmount} (Owes: **${s.formattedOutstandingBalance}**, [${s.creditStatus}], Due: ${s.creditDueDate || "N/A"})`
                )
                .join("\n")
          );
        }
        break;
      }

      case "get_customer_debt": {
        const custDebt = data as {
          error?: string;
          customer?: { name: string; phone: string | null };
          formattedTotalCreditGiven: string;
          formattedTotalAmountPaid: string;
          formattedTotalOutstanding: string;
          formattedTotalOverdue: string;
          hasDebt: boolean;
          creditSales: {
            receiptNumber: string;
            formattedTotalAmount: string;
            formattedOutstandingBalance: string;
            creditStatus: string;
            creditDueDate: string | null;
            payments: { formattedAmount: string; paymentMethod: string; date: string }[];
          }[];
        };

        if (custDebt.error) {
          parts.push(custDebt.error);
        } else if (custDebt.customer) {
          parts.push(
            `### 👤 Customer Debt Profile: ${custDebt.customer.name}\n` +
              `- **Contact**: ${custDebt.customer.phone || "No phone"}\n` +
              `- **Total Lifetime Credit**: ${custDebt.formattedTotalCreditGiven}\n` +
              `- **Total Settled/Paid**: ${custDebt.formattedTotalAmountPaid}\n` +
              `- **Current Outstanding Balance**: **${custDebt.formattedTotalOutstanding}**\n` +
              (custDebt.formattedTotalOverdue !== "₦0.00" && custDebt.formattedTotalOverdue !== "0.00"
                ? `- **Overdue Amount**: ⚠️ **${custDebt.formattedTotalOverdue}**\n\n`
                : "\n") +
              (custDebt.creditSales.length > 0
                ? `**Credit Transactions:**\n` +
                  custDebt.creditSales
                    .map(
                      (s) =>
                        `- **${s.receiptNumber}**: Total ${s.formattedTotalAmount}, Balance: **${s.formattedOutstandingBalance}** [${s.creditStatus}] (Due: ${s.creditDueDate || "N/A"})` +
                        (s.payments.length > 0
                          ? `\n  - *Repayments*: ${s.payments.map((p) => `+${p.formattedAmount} (${p.paymentMethod}) on ${p.date}`).join(", ")}`
                          : "")
                    )
                    .join("\n")
                : "No credit transactions on file.")
          );
        }
        break;
      }

      case "prepare_product": {
        const prodPreview = (data as { preview?: { name: string; sellingPrice: string; costPrice: string; stockQuantity: number; warning?: string | null } }).preview;
        if (prodPreview) {
          parts.push(
            `### 📦 Product Registration Preview\n` +
              `- **Product Name**: **${prodPreview.name}**\n` +
              `- **Selling Price**: ${prodPreview.sellingPrice}\n` +
              `- **Cost Price**: ${prodPreview.costPrice}\n` +
              `- **Initial Stock**: ${prodPreview.stockQuantity} units\n` +
              (prodPreview.warning ? `\n⚠️ *${prodPreview.warning}*\n` : "\n") +
              `*Please click **Confirm** below or reply **1** / **CONFIRM** to add this product to your inventory.*`
          );
        }
        break;
      }

      case "prepare_customer": {
        const custPreview = (data as { preview?: { name: string; phone: string; email: string; address: string; warning?: string | null } }).preview;
        if (custPreview) {
          parts.push(
            `### 👥 Customer Registration Preview\n` +
              `- **Customer Name**: **${custPreview.name}**\n` +
              `- **Phone**: ${custPreview.phone}\n` +
              `- **Email**: ${custPreview.email}\n` +
              `- **Address**: ${custPreview.address}\n` +
              (custPreview.warning ? `\n⚠️ *${custPreview.warning}*\n` : "\n") +
              `*Please click **Confirm** below or reply **1** / **CONFIRM** to register this customer.*`
          );
        }
        break;
      }

      default:
        parts.push(JSON.stringify(data, null, 2));
    }
  }

  return parts.join("\n\n");
}
