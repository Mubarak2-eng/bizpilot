export interface SendWhatsAppResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

/**
 * Sends an outbound WhatsApp text message via Meta WhatsApp Cloud API.
 * Automatically falls back to simulation mode if API credentials are not set.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  bodyText: string
): Promise<SendWhatsAppResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  // Simulation mode for testing / offline environments
  if (!token || !phoneNumberId || token.trim() === "" || phoneNumberId.trim() === "") {
    const mockId = `sim_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    console.log(`[WhatsApp Outbound Simulation] To: ${to}\n${bodyText}\n---`);
    return {
      success: true,
      messageId: mockId,
      simulated: true,
    };
  }

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
