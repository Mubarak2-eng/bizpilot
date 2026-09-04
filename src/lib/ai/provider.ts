import {
  AuthenticatedAIContext,
  ChatMessage,
  ToolDefinition,
} from "./types";

export interface AIProviderResponse {
  content: string;
  toolCalls?: {
    toolName: string;
    params: Record<string, unknown>;
  }[];
  modelName: string;
  provider: "openai" | "gemini" | "local_fallback";
}

export interface AIProvider {
  name: string;
  generateResponse(
    messages: ChatMessage[],
    context: AuthenticatedAIContext,
    tools: ToolDefinition[]
  ): Promise<AIProviderResponse>;
}

/**
 * Robust natural-language parser for invoice drafting intents.
 * Extracts customer candidate and item/quantity candidate without capturing trailing prepositions.
 */
export function parseInvoiceIntent(rawContent: string): {
  customerName?: string;
  items: { productName: string; quantity: number }[];
} | null {
  const text = rawContent.trim();
  const lower = text.toLowerCase();

  // Guard: If it's a read query asking for reports, status, or unpaid lists
  if (
    /^(?:what|how\s+much|how\s+many|how|show|give|list|view|display|check|report|who|can\s+you\s+show|tell\s+me|get)\b/i.test(lower) ||
    lower.includes("show invoice") ||
    lower.includes("unpaid invoice") ||
    lower.includes("pending invoice") ||
    lower.includes("overdue invoice") ||
    lower.includes("invoice status") ||
    lower.includes("invoice list") ||
    lower.includes("invoice summary")
  ) {
    return null;
  }

  // Must have imperative action verb indicating invoice creation
  const isInvoiceCommand =
    /^(?:create|draft|generate|make|prepare|send|bill|invoice)\b/i.test(lower) ||
    /(?:(?:create|draft|generate|make|prepare|send|bill)\s+(?:an?\s+)?invoice\b)/i.test(lower);

  if (!isInvoiceCommand) {
    return null;
  }

  // Pattern 1: (Invoice|Create/Draft/Make invoice [for/to]) <customer> (for|with|containing|consisting of|having|:|of) <qty> <product>
  const match1 = text.match(
    /(?:(?:create|draft|generate|make|prepare|send|bill)\s+(?:an?\s+)?invoice(?:\s+(?:for|to))?|invoice)\s+([A-Za-z0-9\s'-]+?)(?:\s+(?:for|with|containing|consisting of|having|of)\s+|\s*:\s*)(\d+)\s+([A-Za-z0-9\s'-]+?)(?:\s*(?:due|\.|$))/i
  );

  if (match1) {
    let customer = match1[1].trim();
    customer = customer.replace(/\s+(?:for|to|with|of|about)$/i, "").trim();
    const qty = parseInt(match1[2], 10);
    const prod = match1[3].trim().replace(/[.,;]+$/, "");
    return {
      customerName: customer,
      items: [{ productName: prod, quantity: qty }],
    };
  }

  // Pattern 2: Invoice <customer> for/with <qty> <product>
  const match2 = text.match(
    /invoice\s+([A-Za-z0-9\s'-]+?)\s+(?:for|with|containing|:)\s*(\d+)\s+([A-Za-z0-9\s'-]+?)(?:\s*(?:due|\.|$))/i
  );
  if (match2) {
    let customer = match2[1].trim();
    customer = customer.replace(/\s+(?:for|to|with|of|about)$/i, "").trim();
    const qty = parseInt(match2[2], 10);
    const prod = match2[3].trim().replace(/[.,;]+$/, "");
    return {
      customerName: customer,
      items: [{ productName: prod, quantity: qty }],
    };
  }

  // Pattern 3: Fallback finding customer and item parts separately
  const itemMatch = text.match(/(\d+)\s+([A-Za-z0-9\s'-]+?)(?:\s*(?:due|\.|$))/i);
  let customerCandidate: string | undefined = undefined;

  const custMatch = text.match(
    /(?:(?:create|draft|generate|make|prepare|send|bill)\s+(?:an?\s+)?invoice\s+(?:for|to)|invoice)\s+([A-Za-z0-9\s'-]+?)(?:\s+(?:for|with|containing|:|consisting of)|\s*:\s*|\s+\d+|$)/i
  );
  if (custMatch) {
    customerCandidate = custMatch[1].replace(/\s+(?:for|to|with|of|about)$/i, "").trim();
  }

  if (customerCandidate || itemMatch) {
    const qty = itemMatch ? parseInt(itemMatch[1], 10) : 1;
    const prod = itemMatch ? itemMatch[2].trim().replace(/[.,;]+$/, "") : "Items";
    return {
      customerName: customerCandidate,
      items: [{ productName: prod, quantity: qty }],
    };
  }

  return {
    customerName: undefined,
    items: [],
  };
}

/**
 * Robust natural-language parser for recording sales intents.
 * Extracts item name, quantity, customer, and payment method without executing DB writes.
 */
export function parseSaleIntent(rawContent: string): {
  customerName?: string;
  items: { productName: string; quantity: number }[];
  paymentMethod?: string;
} | null {
  const text = rawContent.trim();
  const lower = text.toLowerCase();

  // Guard: If it's a read query asking for reports, metrics, or summaries
  if (
    /^(?:what|how\s+much|how\s+many|how|show|give|list|view|display|check|report|who|can\s+you\s+show|tell\s+me|get)\b/i.test(lower) ||
    lower.includes("sales summary") ||
    lower.includes("best selling") ||
    lower.includes("top selling") ||
    lower.includes("most popular") ||
    lower.includes("how much did") ||
    lower.includes("how many sales") ||
    lower.includes("sales today") ||
    lower.includes("sales this") ||
    lower.includes("sales last") ||
    lower.includes("my sales") ||
    lower.includes("total sales") ||
    lower.includes("sales report")
  ) {
    return null;
  }

  // Must have imperative action verb indicating sale creation
  const isSaleCommand =
    /^(?:sell|record\s+(?:a\s+)?sale|add\s+(?:a\s+)?sale|log\s+(?:a\s+)?sale|create\s+(?:a\s+)?sale|make\s+(?:a\s+)?sale|register\s+(?:a\s+)?sale|new\s+sale)\b/i.test(lower) ||
    /(?:(?:record|add|log|create|make|register)\s+(?:a\s+)?sale\b)/i.test(lower);

  if (!isSaleCommand) {
    return null;
  }

  // Detect payment method
  let paymentMethod = "CASH";
  if (lower.includes("card") || lower.includes("pos")) paymentMethod = "CARD";
  else if (lower.includes("transfer") || lower.includes("bank transfer")) paymentMethod = "TRANSFER";
  else if (lower.includes("mobile money") || lower.includes("momo")) paymentMethod = "MOBILE_MONEY";

  // Check for ambiguous "sell some" / "record a sale of some"
  if (lower.includes("sell some") || lower.includes("a few") || lower.includes("several") || lower.includes("some items")) {
    return {
      items: [],
      paymentMethod,
    };
  }

  // Extract Customer candidate if "to <Customer>" or "for customer <Customer>"
  let customerName: string | undefined = undefined;
  const custMatch = text.match(/(?:\s+to|\s+for\s+customer)\s+([A-Za-z0-9\s'-]+?)(?:\s+(?:for\s+(?:cash|card|transfer|pos|mobile\s+money|₦|\$|[\d,]+)|at|\.|$))/i);
  if (custMatch) {
    const rawCust = custMatch[1].trim();
    if (!["cash", "card", "transfer", "mobile money", "pos"].includes(rawCust.toLowerCase())) {
      customerName = rawCust;
    }
  }

  // Extract quantity & product name
  // Match patterns like:
  // "2 units of Power Bank"
  // "2 pieces of Power Bank"
  // "2 pcs of Power Bank"
  // "2 Power Banks"
  // e.g. "Record a sale of 2 units of Power Bank for ₦5000"
  // e.g. "Add a sale of 2 units of Wireless Bluetooth Headphones"
  // e.g. "Sell 2 units of Power Bank"
  const itemMatch = text.match(/(\d+)\s*(?:units?\s+of\s+|pieces?\s+of\s+|pcs?\s+of\s+|items?\s+of\s+|bottles?\s+of\s+|cartons?\s+of\s+|units?\s+|pieces?\s+|pcs?\s+|x\s+)?([A-Za-z0-9\s'-]+?)(?:\s+(?:to\s+[A-Za-z0-9]|for\s+|at\s+|paid\s+with|[.,;:])|\s*$|$)/i);

  if (itemMatch) {
    const qty = parseInt(itemMatch[1], 10);
    let prodName = itemMatch[2].trim();
    // Strip trailing or leading noise
    prodName = prodName
      .replace(/^(?:of|for|with)\s+/i, "")
      .replace(/\s+(?:for|to|at|paid|with)$/i, "")
      .replace(/[.,;:]+$/, "")
      .trim();

    if (prodName && prodName.length > 0) {
      return {
        customerName,
        items: [{ productName: prodName, quantity: qty }],
        paymentMethod,
      };
    }
  }

  return {
    customerName,
    items: [],
    paymentMethod,
  };
}

/**
 * Robust natural-language parser for recording expense intents.
 */
export function parseExpenseIntent(rawContent: string): {
  category: string;
  amount: number;
  description: string;
} | null {
  const text = rawContent.trim();
  const lower = text.toLowerCase();

  // Guard: If it's a read query asking for reports, totals, or summaries
  if (
    /^(?:what|how\s+much|how|show|give|list|view|display|check|report|tell\s+me|get)\b/i.test(lower) ||
    lower.includes("how much did i spend") ||
    lower.includes("how much did we spend") ||
    lower.includes("expense summary") ||
    lower.includes("expense breakdown") ||
    lower.includes("total expense") ||
    lower.includes("expenses this") ||
    lower.includes("expenses today") ||
    lower.includes("expenses last")
  ) {
    return null;
  }

  // Must have imperative action verb indicating expense recording
  const isExpenseCommand =
    /^(?:record\s+(?:an?\s+)?expense|add\s+(?:an?\s+)?expense|log\s+(?:an?\s+)?expense|save\s+(?:an?\s+)?expense|create\s+(?:an?\s+)?expense|record\s+(?:₦|\$|[\d,]+)|paid\s+(?:₦|\$|[\d,]+)|spent\s+(?:₦|\$|[\d,]+)|i\s+spent)\b/i.test(lower) ||
    /(?:(?:record|add|log|save|create)\s+(?:an?\s+)?expense\b)/i.test(lower) ||
    /(?:(?:spent|paid)\s+(?:₦|\$|[\d,]+))/i.test(lower);

  if (!isExpenseCommand) {
    return null;
  }

  // Extract amount
  const amountMatch = text.match(/(?:₦|\$|£|€)?\s*([\d,]+(?:\.\d+)?)\s*(?:naira|kobo|usd|gbp|eur)?/i);
  const parsedAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0;

  // Extract description and category
  const descMatch = text.match(/(?:for|as|on)\s+([A-Za-z0-9\s]+)/i);
  let category = "Supplies";
  const descText = descMatch ? descMatch[1].trim() : text;

  const lowerDesc = descText.toLowerCase();
  if (lowerDesc.includes("fuel") || lowerDesc.includes("generator") || lowerDesc.includes("repair") || lowerDesc.includes("maintenance") || lowerDesc.includes("diesel")) {
    category = "Maintenance";
  } else if (lowerDesc.includes("rent")) {
    category = "Rent";
  } else if (lowerDesc.includes("electric") || lowerDesc.includes("power") || lowerDesc.includes("nepa") || lowerDesc.includes("phcn") || lowerDesc.includes("water") || lowerDesc.includes("utility") || lowerDesc.includes("internet") || lowerDesc.includes("data") || lowerDesc.includes("wifi")) {
    category = "Utilities";
  } else if (lowerDesc.includes("ad") || lowerDesc.includes("market") || lowerDesc.includes("promo") || lowerDesc.includes("facebook") || lowerDesc.includes("instagram")) {
    category = "Marketing";
  } else if (lowerDesc.includes("salary") || lowerDesc.includes("wage") || lowerDesc.includes("staff") || lowerDesc.includes("stipend")) {
    category = "Salaries";
  } else if (lowerDesc.includes("transport") || lowerDesc.includes("travel") || lowerDesc.includes("delivery") || lowerDesc.includes("logistics") || lowerDesc.includes("uber") || lowerDesc.includes("bolt") || lowerDesc.includes("fare")) {
    category = "Transport";
  }

  return {
    category,
    amount: parsedAmount,
    description: descText,
  };
}

/**
 * Detects if a message is purely a greeting, help request, or capability question.
 * Ensures business questions containing keywords (e.g. sales, products, expenses, etc.)
 * are NEVER classified as greetings.
 */
export function isGreetingOrHelpIntent(rawText: string): boolean {
  const text = rawText.toLowerCase().trim().replace(/[?!.,;:]+$/, "").trim();
  if (!text) return false;

  // List of business keywords that indicate a real business query or action
  const businessKeywords = [
    "sale",
    "sales",
    "revenue",
    "income",
    "product",
    "products",
    "item",
    "items",
    "stock",
    "inventory",
    "low stock",
    "reorder",
    "expense",
    "expenses",
    "spend",
    "spent",
    "cost",
    "customer",
    "customers",
    "client",
    "clients",
    "invoice",
    "invoices",
    "bill",
    "billing",
    "unpaid",
    "debt",
    "owe",
    "owing",
    "profit",
    "margin",
    "summary",
    "overview",
    "performance",
    "brief",
    "attention",
    "health",
    "sell",
    "draft",
    "record",
    "today",
    "yesterday",
    "this month",
    "last month",
    "this week",
  ];

  // If the query contains any business keyword, it is NOT a greeting
  const hasBusinessKeyword = businessKeywords.some((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    return regex.test(text);
  });

  if (hasBusinessKeyword) {
    return false;
  }

  // Exact matches for pure greetings & help
  const exactGreetings = new Set([
    "hello",
    "hi",
    "hey",
    "help",
    "hello bizpilot",
    "hi bizpilot",
    "hey bizpilot",
    "good morning",
    "good afternoon",
    "good evening",
    "good day",
    "who are you",
    "what can you do",
    "what do you do",
    "how does this work",
    "menu",
    "start",
  ]);

  if (exactGreetings.has(text)) {
    return true;
  }

  // Phrases that start with a greeting and are short conversational phrases without business context
  if (
    /^(hello|hi|hey)\s+(there|bot|bizpilot|assistant|friend)$/i.test(text) ||
    /^(good\s+(morning|afternoon|evening|day))$/i.test(text) ||
    /^(what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+can\s+you\s+help)$/i.test(text)
  ) {
    return true;
  }

  return false;
}

/**
 * Deterministic fallback provider for common business queries
 * Used when no external API key is set or when running in offline/testing modes.
 */
export class LocalDeterministicAIProvider implements AIProvider {
  name = "Local Business Copilot Engine";

  async generateResponse(
    messages: ChatMessage[],
    context?: AuthenticatedAIContext
  ): Promise<AIProviderResponse> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const rawContent = lastUserMessage?.content || "";
    const query = rawContent.toLowerCase().trim();

    // 0. Refuse dangerous / destructive / unsupported operations
    if (
      (query.includes("delete") && (query.includes("all") || query.includes("everything") || query.includes("database"))) ||
      query.includes("drop table") ||
      query.includes("drop database") ||
      query.includes("truncate") ||
      (query.includes("reset") && query.includes("inventory"))
    ) {
      return {
        content:
          "⛔ **Operation Refused**: Bulk deletions, direct database modifications, and destructive operations are not supported by the AI Assistant. Please manage individual items safely through the BizPilot dashboard.",
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 0.5 Greetings / Help / Introduction (Strict check: never intercepts business questions)
    if (isGreetingOrHelpIntent(rawContent)) {
      const bizName = context?.businessName ? ` for **${context.businessName}**` : "";
      return {
        content: `👋 Hello! I am your **BizPilot AI Assistant**${bizName}.\n\nYou can ask me questions about your business in plain English, such as:\n• 📊 *"What were my sales today?"*\n• 📦 *"Show me my low-stock products"*\n• 🏆 *"What were my top-selling products this month?"*\n• 💸 *"How much did I spend this month?"*\n• 👥 *"Who are my top customers?"*\n• 🧾 *"Show unpaid invoices"*\n\nHow can I help you today?`,
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // ── 1. WRITE ACTIONS (2-TURN CONFIRMATION FLOW) ──────────────────────────

    // A. Action: DRAFT INVOICE
    const parsedInvoice = parseInvoiceIntent(rawContent);
    if (parsedInvoice !== null) {
      if (!parsedInvoice.customerName && parsedInvoice.items.length === 0) {
        return {
          content:
            "To draft an invoice, please specify the **customer name** and the **items with quantities**.\n\n*Example*: `Create an invoice for Chinedu for 2 power banks.`",
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: "I have prepared the invoice preview below based on your current catalog pricing and tax settings. Please review and confirm to create it:",
        toolCalls: [
          {
            toolName: "draft_invoice",
            params: {
              customerName: parsedInvoice.customerName,
              items: parsedInvoice.items,
            },
          },
        ],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // B. Action: RECORD EXPENSE
    const parsedExpense = parseExpenseIntent(rawContent);
    if (parsedExpense !== null) {
      if (!parsedExpense.amount || parsedExpense.amount <= 0) {
        return {
          content:
            "Please specify a valid expense amount and category.\n\n*Example*: `Record ₦5,000 for generator fuel.`",
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: "I have prepared the expense record preview below. Please confirm to log it to your business records:",
        toolCalls: [
          {
            toolName: "prepare_expense",
            params: {
              category: parsedExpense.category,
              amount: parsedExpense.amount,
              description: parsedExpense.description,
            },
          },
        ],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // C. Action: RECORD SALE
    const parsedSale = parseSaleIntent(rawContent);
    if (parsedSale !== null) {
      if (parsedSale.items.length === 0) {
        return {
          content:
            "To record a sale, please specify the quantity and product name.\n\n*Example*: `Record a sale of 2 units of Power Bank for ₦5000` or `Sell 2 power banks to Chinedu for cash.`",
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: "I have prepared the sale transaction preview below using your verified inventory prices and stock levels. Please review and confirm:",
        toolCalls: [
          {
            toolName: "prepare_sale",
            params: {
              customerName: parsedSale.customerName,
              items: parsedSale.items,
              paymentMethod: parsedSale.paymentMethod || "CASH",
            },
          },
        ],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // ── 2. BUSINESS AUTOPILOT QUERIES ────────────────────────────────────────
    if (
      query.includes("action plan") ||
      query.includes("what should i do today") ||
      query.includes("what should i do about my business") ||
      query.includes("opportunities") ||
      query.includes("opportunity") ||
      query.includes("what matters today")
    ) {
      return {
        content: "Here is today's prioritized Business Action Plan and strategic roadmap:",
        toolCalls: [{ toolName: "get_daily_action_plan", params: {} }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    if (
      query.includes("morning brief") ||
      query.includes("daily brief") ||
      query.includes("give me my morning brief")
    ) {
      return {
        content: "Here is your official Morning Business Briefing:",
        toolCalls: [{ toolName: "get_morning_brief", params: {} }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    if (
      query.includes("what needs my attention") ||
      query.includes("needs attention") ||
      query.includes("needs my attention") ||
      query.includes("what should i know") ||
      query.includes("what should i focus on") ||
      query.includes("what should i do") ||
      query.includes("what is happening in my business") ||
      query.includes("give me advice") ||
      query.includes("advice for my business") ||
      query.includes("industry insight") ||
      query.includes("business brief") ||
      query.includes("how is my business doing") ||
      query.includes("business health")
    ) {
      if (query.includes("attention") && !query.includes("brief") && !query.includes("health")) {
        return {
          content: "Here are the operational matters and situations requiring your immediate attention:",
          toolCalls: [{ toolName: "get_needs_attention", params: {} }],
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: "Here is your executive Business Brief and operational health report:",
        toolCalls: [{ toolName: "get_business_brief", params: {} }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // ── 3. READ-ONLY BUSINESS QUERIES ────────────────────────────────────────

    // 0. Credit & Debtor Queries
    if (
      query.includes("who owes") ||
      query.includes("who is owing") ||
      query.includes("debtors") ||
      query.includes("debtor") ||
      query.includes("owes me") ||
      query.includes("owing me") ||
      query.includes("unpaid debts") ||
      query.includes("overdue debts") ||
      query.includes("outstanding debt") ||
      query.includes("who has not paid") ||
      query.includes("who still owes")
    ) {
      return {
        content: "Here are your customers with outstanding credit balances and debtor accounts:",
        toolCalls: [{ toolName: "get_debtors", params: { limit: 20 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // Specific customer debt query: "How much does John owe?", "How much is Mary owing?"
    const oweMatch =
      query.match(/(?:how much does|how much is)\s+([a-zA-Z\s]+?)\s+(?:owe|owing)/i) ||
      query.match(/(?:debt for|credit for|balance for|owes for)\s+([a-zA-Z\s]+)/i);

    if (oweMatch && oweMatch[1].trim().length > 1 && !query.includes("all customers")) {
      return {
        content: `Checking debt balance and credit history for "${oweMatch[1].trim()}":`,
        toolCalls: [{ toolName: "get_customer_debt", params: { customerName: oweMatch[1].trim() } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // Credit sales queries: "credit sales", "how much credit did I give", "credit transactions"
    if (
      query.includes("credit sale") ||
      query.includes("credit sales") ||
      query.includes("credit given") ||
      query.includes("sold on credit")
    ) {
      let datePhrase = "this_month";
      if (query.includes("today")) datePhrase = "today";
      else if (query.includes("last month")) datePhrase = "last_month";
      else if (query.includes("30 days")) datePhrase = "last_30_days";

      return {
        content: "Here is your credit sales report and receivables status:",
        toolCalls: [{ toolName: "get_credit_sales", params: { datePhrase, limit: 15 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 1. Business summary / executive overview / financial overview
    if (
      query.includes("summary") ||
      query.includes("overview") ||
      query.includes("how is the business") ||
      query.includes("estimated profit") ||
      query.includes("performance") ||
      query.includes("net profit") ||
      query.includes("net margin") ||
      query.includes("how are we doing")
    ) {
      return {
        content: "I've pulled the current financial and operational summary for your business.",
        toolCalls: [{ toolName: "get_business_summary", params: {} }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 2. Sales queries (Read-only)
    if (
      query.includes("sale") ||
      query.includes("revenue") ||
      query.includes("how much did we make") ||
      query.includes("income") ||
      query.includes("transactions")
    ) {
      let datePhrase = "this_month";
      if (query.includes("today")) datePhrase = "today";
      else if (query.includes("yesterday")) datePhrase = "yesterday";
      else if (query.includes("this week") || query.includes("week")) datePhrase = "this_week";
      else if (query.includes("last month")) datePhrase = "last_month";
      else if (query.includes("7 days") || query.includes("past week")) datePhrase = "last_7_days";
      else if (query.includes("30 days")) datePhrase = "last_30_days";

      // If asking about top selling products specifically
      if (query.includes("top") || query.includes("best") || query.includes("fastest") || query.includes("highest")) {
        return {
          content: `Here are your top-performing products based on sales:`,
          toolCalls: [{ toolName: "get_top_products", params: { datePhrase, limit: 5 } }],
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: `Here is the sales activity and revenue summary:`,
        toolCalls: [{ toolName: "get_sales", params: { datePhrase, limit: 10 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 3. Low stock / Inventory (Read-only)
    if (
      query.includes("low stock") ||
      query.includes("stock") ||
      query.includes("shortage") ||
      query.includes("inventory") ||
      query.includes("reorder") ||
      query.includes("out of stock")
    ) {
      return {
        content: "Here are the products currently at or below your low-stock thresholds:",
        toolCalls: [{ toolName: "get_low_stock_products", params: { limit: 20 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 4. Top products (Read-only)
    if (query.includes("top products") || query.includes("best selling") || query.includes("most popular")) {
      return {
        content: "Here are your top-selling products by quantity and revenue:",
        toolCalls: [{ toolName: "get_top_products", params: { datePhrase: "this_month", limit: 5 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 5. Customers / Buyers / Clients (Read-only)
    if (
      query.includes("customer") ||
      query.includes("client") ||
      query.includes("buyers") ||
      query.includes("who bought") ||
      query.includes("who owes")
    ) {
      const nameMatch = query.match(/(?:for|about|summary of|info on)\s+([a-zA-Z\s]+)/i);
      if (nameMatch && nameMatch[1].trim().length > 2 && !query.includes("top customer")) {
        return {
          content: `Looking up customer details for "${nameMatch[1].trim()}":`,
          toolCalls: [{ toolName: "get_customer_summary", params: { customerName: nameMatch[1].trim() } }],
          modelName: "bizpilot-local-copilot",
          provider: "local_fallback",
        };
      }

      return {
        content: "Here is the customer directory and spending summary:",
        toolCalls: [{ toolName: "get_customers", params: { limit: 10 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 6. Expenses / Spending / Costs (Read-only)
    if (
      query.includes("expense") ||
      query.includes("spent") ||
      query.includes("spend") ||
      query.includes("cost") ||
      query.includes("outflow") ||
      query.includes("rent") ||
      query.includes("transport") ||
      query.includes("salaries") ||
      query.includes("utilities")
    ) {
      let datePhrase = "this_month";
      if (query.includes("today")) datePhrase = "today";
      else if (query.includes("last month")) datePhrase = "last_month";

      let category: string | undefined = undefined;
      const categories = ["Rent", "Utilities", "Supplies", "Marketing", "Transport", "Salaries", "Maintenance"];
      for (const cat of categories) {
        if (query.includes(cat.toLowerCase())) {
          category = cat;
          break;
        }
      }

      return {
        content: `Here is your expense breakdown:`,
        toolCalls: [{ toolName: "get_expenses", params: { datePhrase, category, limit: 10 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 7. Invoices / Billing / Unpaid / Due / Debts (Read-only)
    if (
      query.includes("invoice") ||
      query.includes("unpaid") ||
      query.includes("bill") ||
      query.includes("owe") ||
      query.includes("overdue") ||
      query.includes("receivable")
    ) {
      return {
        content: "Here is the current invoice status and outstanding receivables:",
        toolCalls: [{ toolName: "get_invoices", params: { limit: 10 } }],
        modelName: "bizpilot-local-copilot",
        provider: "local_fallback",
      };
    }

    // 8. General fallback: return business summary with helpful guidance
    return {
      content:
        "I can help you monitor sales, analyze top products, track low-stock inventory, review expenses, look up customer records, and check unpaid invoices. Here is your current business overview:",
      toolCalls: [{ toolName: "get_business_summary", params: {} }],
      modelName: "bizpilot-local-copilot",
      provider: "local_fallback",
    };
  }
}

/**
 * OpenAI Provider implementation (supports gpt-4o-mini / gpt-4o with tool calling)
 */
export class OpenAIProvider implements AIProvider {
  name = "OpenAI";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateResponse(
    messages: ChatMessage[],
    context: AuthenticatedAIContext,
    tools: ToolDefinition[]
  ): Promise<AIProviderResponse> {
    const formattedTools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const systemPrompt = `You are BizPilot AI, an expert business operating copilot for "${context.businessName}".
Active currency is ${context.currency}.
Your role is to answer user business inquiries concisely, accurately, and with exact figures from the active business tools.
For write actions (record sale, add sale, sell items, create invoice, draft invoice, record expense):
Always call the corresponding action preparation tool (prepare_sale, draft_invoice, prepare_expense) to generate a preview for user confirmation.
Never execute destructive operations.
For date questions like 'today', 'yesterday', 'this month', use the datePhrase parameter in tools.`;

    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: openAiMessages,
        tools: formattedTools,
        tool_choice: "auto",
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errBody}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0]?.message;

    const toolCalls = choice?.tool_calls?.map((tc: { function: { name: string; arguments: string } }) => {
      let parsed = {};
      try {
        parsed = JSON.parse(tc.function.arguments);
      } catch {
        parsed = {};
      }
      return {
        toolName: tc.function.name,
        params: parsed,
      };
    });

    return {
      content: choice?.content || "",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      modelName: this.model,
      provider: "openai",
    };
  }
}

/**
 * Factory function to resolve active AI provider based on environment configuration
 */
export function getAIProvider(): AIProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.trim().length > 10) {
    return new OpenAIProvider(openaiKey);
  }

  // Fallback to deterministic business engine
  return new LocalDeterministicAIProvider();
}
