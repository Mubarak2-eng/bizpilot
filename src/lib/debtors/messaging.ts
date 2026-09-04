import { normalizePhoneNumber } from "@/lib/whatsapp/security";
import { formatMoney, toDecimalString } from "@/lib/money";

export type ReminderTone = "FRIENDLY" | "OVERDUE" | "FINAL_NOTICE";

export interface DebtorReminderData {
  customerName: string;
  businessName: string;
  currency: string;
  outstandingBalance: number | string;
  dueDate?: string | Date | null;
  overdueDays?: number | null;
  saleId?: string | null;
  itemsSummary?: string | null;
  paymentInstructions?: string | null;
}

/**
 * Calculates overdue days given a due date.
 * Returns 0 if due date is null, in the future, or today.
 */
export function calculateOverdueDays(dueDate?: string | Date | null): number {
  if (!dueDate) return 0;
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(due.getTime())) return 0;

  const now = new Date();
  // Strip times to compare full calendar days
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = startOfToday.getTime() - startOfDueDate.getTime();
  if (diffMs <= 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats a clean date string for messages.
 */
export function formatReminderDueDate(dueDate?: string | Date | null): string {
  if (!dueDate) return "";
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Generates a debtor reminder message text based on the selected tone and dynamic customer/debt data.
 */
export function formatDebtorReminderMessage(
  tone: ReminderTone,
  data: DebtorReminderData
): string {
  const customerName = data.customerName?.trim() || "Valued Customer";
  const businessName = data.businessName?.trim() || "Our Business";
  const formattedBalance = formatMoney(data.outstandingBalance, data.currency);
  const formattedDueDate = formatReminderDueDate(data.dueDate);
  const overdueDays =
    data.overdueDays !== undefined && data.overdueDays !== null
      ? data.overdueDays
      : calculateOverdueDays(data.dueDate);

  const dueDateClause = formattedDueDate ? ` due on ${formattedDueDate}` : "";
  const itemsClause = data.itemsSummary?.trim()
    ? `\n📦 Purchased Items: ${data.itemsSummary.trim()}`
    : "";
  const paymentClause = data.paymentInstructions?.trim()
    ? `\n💳 Payment Details: ${data.paymentInstructions.trim()}`
    : "";

  switch (tone) {
    case "FRIENDLY":
      return `Hello ${customerName},\n\nThis is a friendly reminder from *${businessName}* regarding your outstanding balance of *${formattedBalance}*${dueDateClause}.${itemsClause}${paymentClause}\n\nPlease let us know if payment has already been made or if you require any assistance. Thank you for your continued patronage!\n\nBest regards,\n*${businessName}*`;

    case "OVERDUE": {
      const overdueClause =
        overdueDays > 0
          ? ` is currently *${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue*`
          : " is currently past due";

      return `Dear ${customerName},\n\nWe are following up on your account with *${businessName}*. Your outstanding balance of *${formattedBalance}*${overdueClause}${dueDateClause}.${itemsClause}${paymentClause}\n\nKindly arrange for the settlement of this balance at your earliest convenience. If you have already made this payment, please disregard this notice.\n\nThank you,\n*${businessName}*`;
    }

    case "FINAL_NOTICE": {
      const overdueClause =
        overdueDays > 0
          ? ` (${overdueDays} days overdue)`
          : formattedDueDate
          ? ` (due ${formattedDueDate})`
          : "";

      return `⚠️ *URGENT: FINAL PAYMENT NOTICE*\n\nAttention: *${customerName}*,\n\nThis is an urgent notice from *${businessName}* regarding your unpaid balance of *${formattedBalance}*${overdueClause}.${itemsClause}${paymentClause}\n\nPlease settle this outstanding balance immediately to keep your account in good standing and avoid suspension of credit terms or further collection measures.\n\nFor any inquiries or to confirm payment, please reply directly to this message.\n\n*${businessName} Management*`;
    }

    default:
      return `Hello ${customerName}, please be reminded of your outstanding balance of ${formattedBalance} with ${businessName}. Thank you.`;
  }
}

/**
 * Builds a WhatsApp click-to-chat URL with normalized phone number and URL-encoded message text.
 * e.g. "https://wa.me/2348012345678?text=Hello%20..."
 */
export function buildWhatsAppClickToChatUrl(phone: string, message: string): string {
  if (!phone) return "";
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return "";

  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${normalized}?text=${encodedText}`;
}
