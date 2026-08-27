import crypto from "crypto";

export const OTP_EXPIRATION_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Dynamically resolves the secret key/salt for OTP HMAC hashing.
 * Priority order:
 * 1. Dedicated OTP_SECRET_KEY
 * 2. Auth.js v5 AUTH_SECRET
 * 3. NextAuth NEXTAUTH_SECRET
 * 4. WHATSAPP_APP_SECRET
 * 5. Safe local development fallback
 */
export function getOTPSalt(): string {
  return (
    process.env.OTP_SECRET_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    "bizpilot_otp_salt_2026"
  );
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generateWhatsAppOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Computes a secure HMAC-SHA256 hash of the OTP for storage.
 * The raw OTP is NEVER stored in plaintext.
 */
export function hashOTP(otp: string, customSalt?: string): string {
  const salt = customSalt || getOTPSalt();
  return crypto
    .createHmac("sha256", salt)
    .update(otp.trim())
    .digest("hex");
}

/**
 * Constant-time verification of raw OTP against the stored hash.
 */
export function verifyOTPHash(rawOtp: string, storedHash: string, customSalt?: string): boolean {
  if (!rawOtp || !storedHash) return false;
  const computedHash = hashOTP(rawOtp, customSalt);

  const bufA = Buffer.from(computedHash, "hex");
  const bufB = Buffer.from(storedHash, "hex");

  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
