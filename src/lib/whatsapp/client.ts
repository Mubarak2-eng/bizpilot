export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

/**
 * Sends an outbound WhatsApp text message via Meta WhatsApp Cloud API.
 * Automatically falls back to simulation mode if API credentials are not set.
 *
 * This function uses GLOBAL env vars (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).
 * For multi-tenant WABA connections, use sendWhatsAppTextMessageForBusiness() instead.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  bodyText: string
): Promise<SendWhatsAppResult> {
  const isProduction = process.env.NODE_ENV === "production";
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";

  const hasCredentials = Boolean(token && phoneNumberId);

  // In production, missing credentials must fail closed and NEVER silently simulate
  if (isProduction && !hasCredentials) {
    console.error(
      "[WhatsApp Outbound Error] Critical: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing in production. Outbound message aborted (fail-closed)."
    );
    return {
      success: false,
      error: "WhatsApp API credentials are missing in production.",
    };
  }

  // Simulation mode for testing / offline non-production environments
  if (!hasCredentials) {
    const mockId = `sim_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    console.log(`[WhatsApp Outbound Simulation] To: ${to}\n${bodyText}\n---`);
    return {
      success: true,
      messageId: mockId,
      simulated: true,
    };
  }

  return _sendViaMetaAPI({ token: token!, phoneNumberId: phoneNumberId!, apiVersion, to, bodyText });
}

/**
 * Sends an outbound WhatsApp text message through the per-business WABA connection.
 *
 * Multi-tenancy: Looks up the WhatsAppConnection for the given businessId to retrieve
 * the correct phoneNumberId and metaAccessToken. Never uses global env vars for WABA connections.
 *
 * For INTERNAL_ASSISTANT connections (OTP-verified), falls back to the global env vars so
 * existing functionality is not broken.
 *
 * Security:
 * - businessId must be server-side verified before calling this function.
 * - metaAccessToken is never logged or exposed; only passed to the Meta API.
 */
export async function sendWhatsAppTextMessageForBusiness(
  businessId: string,
  to: string,
  bodyText: string
): Promise<SendWhatsAppResult> {
  // Import prisma lazily to avoid circular dependency issues at module load time
  const { prisma } = await import("../prisma");

  const connection = await prisma.whatsAppConnection.findUnique({
    where: { businessId },
    select: {
      connectionType: true,
      phoneNumberId: true,
      metaAccessToken: true,
      verified: true,
      status: true,
    },
  });

  if (!connection || !connection.verified) {
    return { success: false, error: "No verified WhatsApp connection found for this business." };
  }

  if (connection.status === "DISCONNECTED" || connection.status === "RESTRICTED") {
    return { success: false, error: `WhatsApp connection is ${connection.status.toLowerCase()}.` };
  }

  const isProduction = process.env.NODE_ENV === "production";
  const apiVersion = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";

  // EMBEDDED_WABA: use the per-business credentials stored in the DB
  if (connection.connectionType === "EMBEDDED_WABA") {
    const token = connection.metaAccessToken;
    const phoneNumberId = connection.phoneNumberId;

    if (!token || !phoneNumberId) {
      if (isProduction) {
        return { success: false, error: "WABA credentials are missing for this business connection." };
      }
      // Dev simulation
      const mockId = `sim_waba_msg_${Date.now()}`;
      console.log(`[WhatsApp WABA Simulation] bizId=${businessId} to=${to}\n${bodyText}\n---`);
      return { success: true, messageId: mockId, simulated: true };
    }

    return _sendViaMetaAPI({ token, phoneNumberId, apiVersion, to, bodyText });
  }

  // INTERNAL_ASSISTANT: fall back to global env vars (existing OTP flow)
  return sendWhatsAppTextMessage(to, bodyText);
}

/**
 * Core Meta WhatsApp Cloud API HTTP call.
 * Shared by both sendWhatsAppTextMessage and sendWhatsAppTextMessageForBusiness.
 */
async function _sendViaMetaAPI({
  token,
  phoneNumberId,
  apiVersion,
  to,
  bodyText,
}: {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
  to: string;
  bodyText: string;
}): Promise<SendWhatsAppResult> {
  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: bodyText,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string; code?: number; type?: string };
      };
      const metaMsg = errorData?.error?.message || response.statusText;
      const metaCode = errorData?.error?.code ? ` [Code ${errorData.error.code}]` : "";
      console.error(`[WhatsApp Outbound Error] HTTP ${response.status}${metaCode}: ${metaMsg}`);
      return {
        success: false,
        error: `Meta API HTTP ${response.status}: ${metaMsg}`,
      };
    }

    const data = (await response.json()) as { messages?: { id: string }[] };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error sending WhatsApp message";
    const causeObj = (err as { cause?: { message?: string; code?: string } })?.cause;
    const causeDetail = causeObj?.message || causeObj?.code || "";
    console.error(
      `[WhatsApp Outbound Network Exception] ${errorMsg}${causeDetail ? ` (Cause: ${causeDetail})` : ""}`
    );
    return {
      success: false,
      error: `${errorMsg}${causeDetail ? ` (${causeDetail})` : ""}`,
    };
  }
}


/**
 * Formats Action Previews strictly matching the requested WhatsApp UX.
 */
export function formatActionPreviewForWhatsApp(
  actionType: "CREATE_INVOICE" | "CREATE_SALE" | "CREATE_EXPENSE",
  preview: Record<string, unknown>
): string {
  if (actionType === "CREATE_INVOICE") {
    const customer = (preview.customer as { name: string })?.name || "Customer";
    const total = String(preview.total || "");
    const tax = String(preview.tax || "");
    const items = Array.isArray(preview.items)
      ? preview.items
          .map(
            (i: { name: string; quantity: number; unitPrice: string; total: string }) =>
              `${i.quantity} × ${i.name} — ${i.total}`
          )
          .join("\n")
      : "";

    return `Invoice Preview\n\nCustomer: ${customer}\n${items}\nVAT: ${tax}\nTotal: ${total}\n\nReply 1 to confirm\nReply 2 to cancel`;
  }

  if (actionType === "CREATE_SALE") {
    const customer = String(preview.customer || "Walk-in Customer");
    const paymentMethod = String(preview.paymentMethod || "CASH");
    const total = String(preview.total || "");
    const items = Array.isArray(preview.items)
      ? preview.items
          .map(
            (i: { name: string; quantity: number; unitPrice: string; total: string }) =>
              `${i.quantity} × ${i.name} — ${i.total}`
          )
          .join("\n")
      : "";

    return `Sale Preview\n\nCustomer: ${customer}\n${items}\nPayment Method: ${paymentMethod}\nTotal: ${total}\n\nReply 1 to confirm\nReply 2 to cancel`;
  }

  if (actionType === "CREATE_EXPENSE") {
    const category = String(preview.category || "");
    const amount = String(preview.amount || "");
    const description = String(preview.description || "");
    const date = String(preview.date || "");

    return `Expense Preview\n\nCategory: ${category}\nAmount: ${amount}\nDescription: ${description}\nDate: ${date}\n\nReply 1 to confirm\nReply 2 to cancel`;
  }

  return "Action Preview\n\nReply 1 to confirm\nReply 2 to cancel";
}

/**
 * Formats Action Success notifications strictly matching the requested WhatsApp UX.
 */
export function formatActionSuccessForWhatsApp(
  actionType: "CREATE_INVOICE" | "CREATE_SALE" | "CREATE_EXPENSE",
  outcome: {
    displayNumber?: string;
    customerName?: string;
    totalFormatted?: string;
    category?: string;
    description?: string;
    paymentMethod?: string;
  }
): string {
  if (actionType === "CREATE_INVOICE") {
    return `✅ Invoice created successfully!\n\nInvoice: ${outcome.displayNumber || "INV"}\nCustomer: ${outcome.customerName || "Customer"}\nTotal: ${outcome.totalFormatted || ""}`;
  }

  if (actionType === "CREATE_SALE") {
    return `✅ Sale recorded successfully!\n\nSale ID: ${outcome.displayNumber || "SAL"}\nCustomer: ${outcome.customerName || "Customer"}\nTotal: ${outcome.totalFormatted || ""}\nPayment Method: ${outcome.paymentMethod || "CASH"}`;
  }

  if (actionType === "CREATE_EXPENSE") {
    return `✅ Expense recorded successfully!\n\nCategory: ${outcome.category || "Expense"}\nAmount: ${outcome.totalFormatted || ""}\nDescription: ${outcome.description || "Logged via WhatsApp"}`;
  }

  return "✅ Action confirmed and recorded successfully!";
}
