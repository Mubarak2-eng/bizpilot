import { Resend } from "resend";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Gets or initializes the Resend client instance.
 * Returns null if RESEND_API_KEY is not configured.
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  return new Resend(apiKey);
}

/**
 * Sends a transactional email using Resend.
 * In production, fails closed if RESEND_API_KEY is missing.
 * In development/test, provides safe developer fallback.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const isProd = process.env.NODE_ENV === "production";
  const fromAddress = process.env.FROM_EMAIL || "BizPilot AI <notifications@bizpilot.app>";
  const supportEmail = process.env.SUPPORT_EMAIL || "support@bizpilot.app";

  const resend = getResendClient();

  if (!resend) {
    if (isProd) {
      console.error("[Email Security] RESEND_API_KEY missing in production. Refusing to send email.");
      return {
        success: false,
        error: "Transactional email service is not configured in production.",
      };
    }

    // Safe development-only log
    console.warn(`[Dev Email Simulation] To: ${Array.isArray(options.to) ? options.to.join(", ") : options.to} | Subject: "${options.subject}"`);
    return {
      success: true,
      messageId: `dev-sim-${Date.now()}`,
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || supportEmail,
    });

    if (error) {
      console.error("[Email Error] Resend API failed:", error);
      return {
        success: false,
        error: error.message || "Failed to send email through provider.",
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unexpected email error.";
    console.error("[Email Exception]", msg);
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Sends the 6-digit login verification PIN email to the user.
 */
export async function sendLoginPinEmail({
  to,
  name,
  pin,
  expiresInMinutes = 10,
}: {
  to: string;
  name?: string | null;
  pin: string;
  expiresInMinutes?: number;
}): Promise<EmailResult> {
  const supportEmail = process.env.SUPPORT_EMAIL || "support@bizpilot.app";
  const recipientName = name || "BizPilot Operator";

  const subject = `${pin} is your BizPilot AI verification code`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050816; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 520px; margin: 0 auto; background: #090e24; border: 1px solid #1e293b; border-radius: 20px; padding: 36px; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.5); }
    .logo-badge { display: inline-block; width: 44px; height: 44px; background: linear-gradient(135deg, #7c3aed, #4f46e5, #06b6d4); border-radius: 12px; text-align: center; line-height: 44px; font-weight: 900; color: #ffffff; font-size: 18px; margin-bottom: 20px; }
    .title { font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 8px 0; letter-spacing: -0.02em; }
    .subtitle { font-size: 13px; color: #94a3b8; margin: 0 0 24px 0; }
    .pin-box { background: #060919; border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 14px; padding: 24px; text-align: center; margin: 24px 0; }
    .pin-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #a78bfa; letter-spacing: 0.1em; margin-bottom: 8px; }
    .pin-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 0.25em; color: #22d3ee; margin: 0; padding-left: 0.25em; }
    .expiry { font-size: 12px; color: #cbd5e1; margin-top: 10px; font-weight: 500; }
    .warning { background: rgba(244, 63, 94, 0.1); border-left: 3px solid #f43f5e; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #fda4af; margin: 20px 0; line-height: 1.5; }
    .footer { border-top: 1px solid #1e293b; margin-top: 32px; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; }
    .footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-badge">BP</div>
    <h1 class="title">Verify Your Sign-In</h1>
    <p class="subtitle">Hello ${recipientName}, you requested a sign-in to your <strong>BizPilot AI</strong> business operating account.</p>
    
    <div class="pin-box">
      <div class="pin-label">Your Security Verification Code</div>
      <div class="pin-code">${pin}</div>
      <div class="expiry">Expires in <strong>${expiresInMinutes} minutes</strong></div>
    </div>

    <div class="warning">
      <strong>Security Notice:</strong> Never share this code with anyone. BizPilot employees will never ask for your verification code.
    </div>

    <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
      If you did not request this code, your password may still be secure, but you should change your password immediately or contact our support team.
    </p>

    <div class="footer">
      BizPilot AI — Autonomous Business Operating System<br>
      Need help? Contact <a href="mailto:${supportEmail}">${supportEmail}</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
BizPilot AI Login Verification Code

Hello ${recipientName},

Your 6-digit login verification code is: ${pin}

This code will expire in ${expiresInMinutes} minutes.

SECURITY NOTICE: Never share this code with anyone. BizPilot AI will never ask for your verification code.

If you did not request this login code, please change your password or contact support at ${supportEmail}.
  `.trim();

  return sendEmail({
    to,
    subject,
    html,
    text,
  });
}

/**
 * Escapes unsafe characters for HTML safety.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Sends a customer announcement/campaign email.
 * Applies HTML sanitization to user-provided body text.
 */
export async function sendCustomerCampaignEmail({
  to,
  customerName,
  businessName,
  subject,
  message,
}: {
  to: string;
  customerName?: string | null;
  businessName: string;
  subject: string;
  message: string;
}): Promise<EmailResult> {
  const recipientName = customerName?.trim() || "Valued Customer";
  const safeBusinessName = escapeHtml(businessName);
  const safeSubject = escapeHtml(subject);

  // Format message lines safely into HTML paragraphs
  const safeParagraphs = message
    .split(/\n\n+/)
    .map((block) => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #e2e8f0; font-size: 14px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050816; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #090e24; border: 1px solid #1e293b; border-radius: 20px; padding: 36px; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.5); }
    .biz-badge { display: inline-block; padding: 6px 14px; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 100px; font-weight: 700; color: #c4b5fd; font-size: 12px; margin-bottom: 20px; letter-spacing: 0.02em; }
    .title { font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 16px 0; letter-spacing: -0.02em; line-height: 1.3; }
    .greeting { font-size: 14px; font-weight: 600; color: #38bdf8; margin: 0 0 18px 0; }
    .content-box { background: #060919; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; margin: 20px 0; }
    .footer { border-top: 1px solid #1e293b; margin-top: 32px; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="biz-badge">🏢 ${safeBusinessName}</div>
    <h1 class="title">${safeSubject}</h1>
    <div class="greeting">Hello ${escapeHtml(recipientName)},</div>

    <div class="content-box">
      ${safeParagraphs}
    </div>

    <div class="footer">
      Sent by <strong>${safeBusinessName}</strong> via BizPilot AI.<br>
      You are receiving this business update because you are a registered customer of ${safeBusinessName}.
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
${subject}

Hello ${recipientName},

${message}

---
Sent by ${businessName} via BizPilot AI.
You are receiving this business update because you are a registered customer of ${businessName}.
  `.trim();

  return sendEmail({
    to,
    subject: `${businessName}: ${subject}`,
    html,
    text,
  });
}

/**
 * Sends a debtor payment reminder / notice email.
 */
export async function sendDebtorReminderEmail({
  to,
  customerName,
  businessName,
  outstandingBalance,
  currency = "NGN",
  dueDate,
  tone = "FRIENDLY",
  message,
}: {
  to: string;
  customerName?: string | null;
  businessName: string;
  outstandingBalance: string;
  currency?: string;
  dueDate?: string | null;
  tone?: "FRIENDLY" | "OVERDUE" | "FINAL_NOTICE";
  message: string;
}): Promise<EmailResult> {
  const recipientName = customerName?.trim() || "Valued Customer";
  const safeBusinessName = escapeHtml(businessName);

  const subjectPrefix =
    tone === "FINAL_NOTICE"
      ? "URGENT: Final Payment Demand"
      : tone === "OVERDUE"
      ? "Overdue Payment Notice"
      : "Payment Reminder";

  const subject = `${subjectPrefix}: Outstanding Balance of ${currency} ${outstandingBalance}`;

  const toneBadgeColor =
    tone === "FINAL_NOTICE"
      ? "background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.3); color: #fda4af;"
      : tone === "OVERDUE"
      ? "background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fcd34d;"
      : "background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3); color: #67e8f9;";

  const toneBadgeText =
    tone === "FINAL_NOTICE"
      ? "⚠️ FINAL NOTICE"
      : tone === "OVERDUE"
      ? "⏳ OVERDUE NOTICE"
      : "📋 PAYMENT REMINDER";

  const safeParagraphs = message
    .split(/\n\n+/)
    .map((block) => `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #e2e8f0; font-size: 14px;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #050816; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #090e24; border: 1px solid #1e293b; border-radius: 20px; padding: 36px; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.5); }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 100px; font-weight: 700; font-size: 12px; margin-bottom: 20px; letter-spacing: 0.05em; }
    .title { font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 16px 0; letter-spacing: -0.02em; }
    .debt-box { background: #060919; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; margin: 20px 0; text-align: center; }
    .debt-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 6px; }
    .debt-amount { font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: 900; color: #38bdf8; margin: 0; }
    .debt-due { font-size: 12px; color: #cbd5e1; margin-top: 6px; }
    .content-box { background: #060919; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; margin: 20px 0; }
    .footer { border-top: 1px solid #1e293b; margin-top: 32px; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge" style="${toneBadgeColor}">${toneBadgeText}</div>
    <h1 class="title">${escapeHtml(subjectPrefix)} from ${safeBusinessName}</h1>
    
    <div class="debt-box">
      <div class="debt-label">Outstanding Balance</div>
      <div class="debt-amount">${escapeHtml(currency)} ${escapeHtml(outstandingBalance)}</div>
      ${dueDate ? `<div class="debt-due">Due Date: <strong>${escapeHtml(dueDate)}</strong></div>` : ""}
    </div>

    <div class="content-box">
      ${safeParagraphs}
    </div>

    <div class="footer">
      Sent by <strong>${safeBusinessName}</strong> via BizPilot AI.<br>
      If you have already settled this payment, please contact ${safeBusinessName} to reconcile your account.
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
${subject}

Hello ${recipientName},

Outstanding Balance: ${currency} ${outstandingBalance}
${dueDate ? `Due Date: ${dueDate}` : ""}

${message}

---
Sent by ${businessName} via BizPilot AI.
  `.trim();

  return sendEmail({
    to,
    subject: `${businessName} - ${subject}`,
    html,
    text,
  });
}

