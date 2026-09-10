"use server";

import { prisma } from "@/lib/prisma";
import { requireBusinessMembership } from "@/lib/auth-helpers";
import { normalizePhoneNumber } from "@/lib/whatsapp/security";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client";
import { sendDebtorReminderEmail } from "@/lib/email";
import { formatMoney, toDecimalString } from "@/lib/money";
import {
  ReminderTone,
  DebtorReminderData,
  formatDebtorReminderMessage,
  buildWhatsAppClickToChatUrl,
  calculateOverdueDays,
} from "@/lib/debtors/messaging";

export interface DebtorReminderPreviewResult {
  success?: boolean;
  error?: string;
  customer?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    normalizedPhone: string | null;
  };
  business?: {
    id: string;
    name: string;
    currency: string;
  };
  saleId?: string | null;
  totalOutstanding?: string;
  formattedOutstanding?: string;
  dueDate?: string | null;
  overdueDays?: number;
  isOverdue?: boolean;
  itemsSummary?: string | null;
  suggestedTone?: ReminderTone;
  message?: string;
  clickToChatUrl?: string;
  hasVerifiedWhatsApp?: boolean;
  canSendWhatsApp?: boolean;
  canSendEmail?: boolean;
}

export interface DebtorReminderActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  dispatchedVia?: "API" | "CLICK_TO_CHAT" | "EMAIL";
  clickToChatUrl?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Previews customer debt data and generates a customized reminder message.
 * Scoped strictly to the active business context.
 */
export async function getDebtorReminderPreviewAction(
  businessId: string,
  customerId: string,
  saleId?: string | null,
  tone: ReminderTone = "FRIENDLY"
): Promise<DebtorReminderPreviewResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    if (!customerId) {
      return { error: "Customer ID is required." };
    }

    // Fetch customer and their non-cancelled credit sales strictly scoped to this business
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: context.business.id,
      },
      include: {
        sales: {
          where: {
            isCredit: true,
            status: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          include: {
            items: {
              include: {
                product: {
                  select: { name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customer) {
      return { error: "Customer not found or access denied." };
    }

    let targetOutstanding = 0;
    let targetDueDate: Date | null = null;
    let itemsSummary: string | null = null;

    if (saleId) {
      const specificSale = customer.sales.find((s) => s.id === saleId);
      if (!specificSale) {
        return { error: "Specified credit sale not found for this customer." };
      }

      targetOutstanding = Number(specificSale.outstandingBalance.toString());
      if (targetOutstanding <= 0) {
        return { error: "This credit sale has already been fully settled." };
      }

      targetDueDate = specificSale.creditDueDate;
      if (specificSale.items.length > 0) {
        itemsSummary = specificSale.items
          .map((i) => `${i.quantity}x ${i.product.name}`)
          .join(", ");
      }
    } else {
      // Calculate aggregate balance across all credit sales
      const activeCreditSales = customer.sales.filter(
        (s) => Number(s.outstandingBalance.toString()) > 0
      );

      targetOutstanding = activeCreditSales.reduce(
        (sum, s) => sum + Number(s.outstandingBalance.toString()),
        0
      );

      if (targetOutstanding <= 0) {
        return { error: `Customer "${customer.name}" currently has no outstanding debt.` };
      }

      // Find the earliest due date among unpaid credit sales
      const dueDates = activeCreditSales
        .map((s) => s.creditDueDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      if (dueDates.length > 0) {
        targetDueDate = dueDates[0];
      }

      // Collect item names from active sales
      const allItemNames = Array.from(
        new Set(
          activeCreditSales.flatMap((s) => s.items.map((i) => i.product.name))
        )
      );
      if (allItemNames.length > 0) {
        itemsSummary = allItemNames.slice(0, 4).join(", ");
        if (allItemNames.length > 4) {
          itemsSummary += ` (+${allItemNames.length - 4} more)`;
        }
      }
    }

    const overdueDays = calculateOverdueDays(targetDueDate);
    const isOverdue = overdueDays > 0;

    const suggestedTone: ReminderTone =
      overdueDays > 14
        ? "FINAL_NOTICE"
        : overdueDays > 0
        ? "OVERDUE"
        : "FRIENDLY";

    const effectiveTone = tone || suggestedTone;

    const reminderData: DebtorReminderData = {
      customerName: customer.name,
      businessName: context.business.name,
      currency: context.business.currency,
      outstandingBalance: targetOutstanding,
      dueDate: targetDueDate,
      overdueDays,
      saleId: saleId || null,
      itemsSummary,
    };

    const messageText = formatDebtorReminderMessage(effectiveTone, reminderData);
    const normalizedPhone = customer.phone ? normalizePhoneNumber(customer.phone) : null;
    const canSendWhatsApp = Boolean(normalizedPhone && normalizedPhone.length >= 8);
    const canSendEmail = Boolean(customer.email && EMAIL_REGEX.test(customer.email.toLowerCase().trim()));

    const clickToChatUrl = canSendWhatsApp && normalizedPhone
      ? buildWhatsAppClickToChatUrl(normalizedPhone, messageText)
      : "";

    // Check if business has an active verified WhatsApp bot connection
    const whatsAppConnection = await prisma.whatsAppConnection.findUnique({
      where: {
        businessId: context.business.id,
      },
    });

    return {
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        normalizedPhone,
      },
      business: {
        id: context.business.id,
        name: context.business.name,
        currency: context.business.currency,
      },
      saleId: saleId || null,
      totalOutstanding: toDecimalString(targetOutstanding),
      formattedOutstanding: formatMoney(targetOutstanding, context.business.currency),
      dueDate: targetDueDate ? targetDueDate.toISOString() : null,
      overdueDays,
      isOverdue,
      itemsSummary,
      suggestedTone,
      message: messageText,
      clickToChatUrl,
      hasVerifiedWhatsApp: Boolean(whatsAppConnection && whatsAppConnection.verified),
      canSendWhatsApp,
      canSendEmail,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate reminder preview.";
    return { error: msg };
  }
}

/**
 * Sends or prepares a WhatsApp payment reminder for a debtor.
 * If the business has a verified WhatsApp connection, attempts direct Meta Cloud API dispatch;
 * always provides the click-to-chat URL as an instant fallback.
 */
export async function sendDebtorWhatsAppReminderAction(
  businessId: string,
  customerId: string,
  saleId?: string | null,
  customMessage?: string,
  tone: ReminderTone = "FRIENDLY"
): Promise<DebtorReminderActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    if (!customerId) {
      return { error: "Customer ID is required." };
    }

    // Verify customer and calculate live DB balance
    const preview = await getDebtorReminderPreviewAction(
      businessId,
      customerId,
      saleId,
      tone
    );

    if (!preview.success || !preview.customer) {
      return { error: preview.error || "Customer debt record not found." };
    }

    const { customer, totalOutstanding } = preview;
    if (!totalOutstanding || parseFloat(totalOutstanding) <= 0) {
      return { error: `Customer "${customer.name}" has no outstanding debt.` };
    }

    if (!customer.phone) {
      return { error: `Customer "${customer.name}" does not have a phone number on record.` };
    }

    const normalizedPhone = normalizePhoneNumber(customer.phone);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      return {
        error: `Customer phone number "${customer.phone}" is not a valid WhatsApp phone number.`,
      };
    }

    const finalMessage = customMessage?.trim() || preview.message || "";
    if (!finalMessage) {
      return { error: "Reminder message content cannot be empty." };
    }

    const clickToChatUrl = buildWhatsAppClickToChatUrl(normalizedPhone, finalMessage);

    // Check if business has a verified WhatsApp Cloud API connection
    const whatsAppConnection = await prisma.whatsAppConnection.findUnique({
      where: {
        businessId: context.business.id,
      },
    });

    if (whatsAppConnection && whatsAppConnection.verified) {
      // Dispatch via Meta WhatsApp Cloud API
      const sendResult = await sendWhatsAppTextMessage(normalizedPhone, finalMessage);

      if (sendResult.success) {
        return {
          success: true,
          message: `WhatsApp payment reminder sent successfully to ${customer.name} (+${normalizedPhone}).`,
          dispatchedVia: "API",
          clickToChatUrl,
        };
      } else {
        // If Meta API dispatch failed, fallback to click-to-chat
        return {
          success: true,
          message: `WhatsApp direct API dispatch failed (${sendResult.error || "Meta API error"}). Click below to send via WhatsApp Web / App.`,
          dispatchedVia: "CLICK_TO_CHAT",
          clickToChatUrl,
        };
      }
    }

    // No verified API connection on this business -> Return click-to-chat URL
    return {
      success: true,
      message: `WhatsApp reminder prepared for ${customer.name}. Opening WhatsApp...`,
      dispatchedVia: "CLICK_TO_CHAT",
      clickToChatUrl,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send WhatsApp reminder.";
    return { error: msg };
  }
}

/**
 * Sends an email payment reminder to a debtor via Resend.
 */
export async function sendDebtorEmailReminderAction(
  businessId: string,
  customerId: string,
  saleId?: string | null,
  customMessage?: string,
  tone: ReminderTone = "FRIENDLY"
): Promise<DebtorReminderActionResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    if (!customerId) {
      return { error: "Customer ID is required." };
    }

    const preview = await getDebtorReminderPreviewAction(
      businessId,
      customerId,
      saleId,
      tone
    );

    if (!preview.success || !preview.customer) {
      return { error: preview.error || "Customer debt record not found." };
    }

    const { customer, totalOutstanding, dueDate } = preview;
    if (!totalOutstanding || parseFloat(totalOutstanding) <= 0) {
      return { error: `Customer "${customer.name}" has no outstanding debt.` };
    }

    if (!customer.email || !EMAIL_REGEX.test(customer.email.toLowerCase().trim())) {
      return {
        error: `Customer "${customer.name}" does not have a valid email address on record.`,
      };
    }

    const finalMessage = customMessage?.trim() || preview.message || "";
    if (!finalMessage) {
      return { error: "Reminder message content cannot be empty." };
    }

    const formattedDueDate = dueDate
      ? new Date(dueDate).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

    const emailResult = await sendDebtorReminderEmail({
      to: customer.email.toLowerCase().trim(),
      customerName: customer.name,
      businessName: context.business.name,
      outstandingBalance: totalOutstanding,
      currency: context.business.currency,
      dueDate: formattedDueDate,
      tone,
      message: finalMessage,
    });

    if (!emailResult.success) {
      return {
        error: emailResult.error || "Failed to dispatch email to customer.",
      };
    }

    return {
      success: true,
      message: `Payment reminder email sent successfully to ${customer.name} (${customer.email}).`,
      dispatchedVia: "EMAIL",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to send email reminder.";
    return { error: msg };
  }
}
