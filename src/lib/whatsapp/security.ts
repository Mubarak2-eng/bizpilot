import crypto from "crypto";

// ─── 1. Phone Number Normalization ───────────────────────────────────────────

/**
 * Normalizes phone numbers to standard E.164 digits without '+' (e.g. "2348012345678").
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";

  // Strip non-digit characters
  let digits = raw.replace(/\D/g, "");

  // Convert Nigerian 11-digit local format ("08012345678") to international ("2348012345678")
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "234" + digits.slice(1);
  }

  return digits;
}

// ─── 2. HMAC SHA-256 Webhook Signature Verification ──────────────────────────

/**
 * Validates Meta x-hub-signature-256 using timing-safe comparison.
 * In production, WHATSAPP_APP_SECRET is strictly required (fails closed if missing).
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
): boolean {
  const isProduction = process.env.NODE_ENV === "production";
  const envSecret = process.env.WHATSAPP_APP_SECRET;
  const secret = (appSecret && appSecret.trim() !== "") 
    ? appSecret 
    : (envSecret && envSecret.trim() !== "") 
      ? envSecret 
      : undefined;

  if (!secret) {
    if (isProduction) {
      console.error(
        "[WhatsApp Security] Critical: WHATSAPP_APP_SECRET is missing in production. Rejecting webhook (fail-closed)."
      );
      return false;
    }
    // In dev/test with no secret configured: allow only if no signatureHeader was sent
    return !signatureHeader;
  }

  if (!signatureHeader) {
    return false;
  }

  try {
    const [algo, signature] = signatureHeader.split("=");
    if (algo !== "sha256" || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const actualBuffer = Buffer.from(signature, "hex");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

// ─── 3. Message Deduplication / Idempotency Store ─────────────────────────────

interface DeduplicationEntry {
  messageId: string;
  processedAt: number;
}

const processedMessagesMap = new Map<string, DeduplicationEntry>();
const DEDUPLICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Checks if an incoming WhatsApp message ID was already processed.
 */
export function isMessageProcessed(messageId: string): boolean {
  if (!messageId) return false;
  const entry = processedMessagesMap.get(messageId);
  if (!entry) return false;

  // If expired, clean up
  if (Date.now() - entry.processedAt > DEDUPLICATION_TTL_MS) {
    processedMessagesMap.delete(messageId);
    return false;
  }

  return true;
}

/**
 * Marks a message ID as processed.
 */
export function markMessageProcessed(messageId: string): void {
  if (!messageId) return;
  processedMessagesMap.set(messageId, {
    messageId,
    processedAt: Date.now(),
  });

  // Periodic cleanup if map grows
  if (processedMessagesMap.size > 1000) {
    const cutoff = Date.now() - DEDUPLICATION_TTL_MS;
    for (const [k, v] of processedMessagesMap.entries()) {
      if (v.processedAt < cutoff) {
        processedMessagesMap.delete(k);
      }
    }
  }
}

// ─── 4. Sliding-Window Rate Limiter ──────────────────────────────────────────

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 messages/minute per number

/**
 * Checks if a phone number is exceeding the rate limit.
 * Returns true if allowed, false if rate limited.
 */
export function checkRateLimit(
  phoneNumber: string,
  limit = MAX_REQUESTS_PER_WINDOW
): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phoneNumber) || [];

  // Filter timestamps within the current window
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= limit) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(phoneNumber, validTimestamps);
  return true;
}

/**
 * Resets rate limit map (useful for test isolation).
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}
