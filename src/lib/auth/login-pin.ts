import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { sendLoginPinEmail } from "@/lib/email";

export interface SanitizedUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface InitiateLoginResult {
  success: boolean;
  challengeId?: string;
  email?: string;
  error?: string;
  cooldownSeconds?: number;
  expiresAt?: string;
}

export interface ResendPinResult {
  success: boolean;
  error?: string;
  cooldownSeconds?: number;
}

export interface VerifyPinResult {
  success: boolean;
  user?: SanitizedUser;
  error?: string;
}

/**
 * Masks an email for display: "o***@b***.test"
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!domain) return email;

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0]}***`
      : `${localPart[0]}***${localPart[localPart.length - 1]}`;

  const domainParts = domain.split(".");
  const maskedDomain =
    domainParts[0].length <= 2
      ? `${domainParts[0][0]}***`
      : `${domainParts[0][0]}***${domainParts[0][domainParts[0].length - 1]}`;

  return `${maskedLocal}@${maskedDomain}.${domainParts.slice(1).join(".")}`;
}

/**
 * Generates a cryptographically secure 6-digit numeric PIN.
 * Range: 100000 - 999999
 */
export function generateSecurePin(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Step 1: Validate email + password and create a secure login PIN challenge.
 * Sends the 6-digit PIN to the user's email.
 */
export async function createLoginChallenge(
  emailInput?: string,
  passwordInput?: string
): Promise<InitiateLoginResult> {
  if (!emailInput || !passwordInput) {
    return { success: false, error: "Please enter your email and password." };
  }

  const email = String(emailInput).toLowerCase().trim();
  const password = String(passwordInput);

  // Validate credentials
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
    },
  });

  if (!user || !user.password) {
    // Avoid user enumeration
    return { success: false, error: "Invalid email or password. Please check your credentials." };
  }

  const isPasswordValid = await verifyPassword(password, user.password);
  if (!isPasswordValid) {
    return { success: false, error: "Invalid email or password. Please check your credentials." };
  }

  // Generate cryptographically secure PIN and hash it
  const plainPin = generateSecurePin();
  const pinHash = await hashPassword(plainPin);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const resendCooldownUntil = new Date(Date.now() + 60 * 1000); // 60 seconds

  // Clean up any old unconsumed pins for this user
  await prisma.loginPin.deleteMany({
    where: {
      userId: user.id,
      consumedAt: null,
    },
  });

  // Create LoginPin record
  const challenge = await prisma.loginPin.create({
    data: {
      userId: user.id,
      email: user.email,
      pinHash,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      resendCooldownUntil,
    },
  });

  // Send verification email via Resend
  const emailResult = await sendLoginPinEmail({
    to: user.email,
    name: user.name,
    pin: plainPin,
    expiresInMinutes: 10,
  });

  if (!emailResult.success) {
    // If in production and email failed, delete challenge to fail closed
    if (process.env.NODE_ENV === "production") {
      await prisma.loginPin.delete({ where: { id: challenge.id } }).catch(() => {});
      return {
        success: false,
        error: "Unable to send verification email. Please ensure email service is configured or contact support.",
      };
    }
  }

  return {
    success: true,
    challengeId: challenge.id,
    email: maskEmail(user.email),
    cooldownSeconds: 60,
    expiresAt: challenge.expiresAt.toISOString(),
  };
}

/**
 * Resends a new login verification PIN for an active challenge.
 * Enforces server-side 60s cooldown and invalidates old PIN.
 */
export async function resendLoginPin(challengeId: string): Promise<ResendPinResult> {
  if (!challengeId) {
    return { success: false, error: "Invalid verification session." };
  }

  const challenge = await prisma.loginPin.findUnique({
    where: { id: challengeId },
    include: { user: true },
  });

  if (!challenge || challenge.consumedAt !== null) {
    return { success: false, error: "Verification session not found or already used." };
  }

  const now = new Date();

  // Enforce server-side cooldown
  if (now < challenge.resendCooldownUntil) {
    const remainingSec = Math.ceil((challenge.resendCooldownUntil.getTime() - now.getTime()) / 1000);
    return {
      success: false,
      error: `Please wait ${remainingSec} second${remainingSec === 1 ? "" : "s"} before requesting another code.`,
      cooldownSeconds: remainingSec,
    };
  }

  // Check if session completely expired
  if (now > challenge.expiresAt) {
    return { success: false, error: "Verification session has expired. Please log in again." };
  }

  // Generate new PIN and hash
  const plainPin = generateSecurePin();
  const pinHash = await hashPassword(plainPin);
  const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const newCooldown = new Date(Date.now() + 60 * 1000);

  await prisma.loginPin.update({
    where: { id: challengeId },
    data: {
      pinHash,
      attempts: 0,
      expiresAt: newExpiresAt,
      resendCooldownUntil: newCooldown,
    },
  });

  const emailResult = await sendLoginPinEmail({
    to: challenge.email,
    name: challenge.user.name,
    pin: plainPin,
    expiresInMinutes: 10,
  });

  if (!emailResult.success && process.env.NODE_ENV === "production") {
    return {
      success: false,
      error: "Unable to send verification email. Please contact support.",
    };
  }

  return {
    success: true,
    cooldownSeconds: 60,
  };
}

/**
 * Validates the submitted PIN against the challenge.
 * Enforces:
 * - Expiration check (10 mins)
 * - Single-use consumption
 * - Brute-force attempt limit (max 5)
 */
export async function verifyLoginPinChallenge(
  challengeId?: string | null,
  pinInput?: string | null
): Promise<SanitizedUser | null> {
  if (!challengeId || !pinInput) {
    return null;
  }

  const cleanPin = String(pinInput).trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    return null;
  }

  const challenge = await prisma.loginPin.findUnique({
    where: { id: challengeId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!challenge || !challenge.user) {
    return null;
  }

  // Single-use: already consumed
  if (challenge.consumedAt !== null) {
    return null;
  }

  const now = new Date();

  // Expiration check
  if (now > challenge.expiresAt) {
    return null;
  }

  // Brute-force protection: check max attempts
  if (challenge.attempts >= challenge.maxAttempts) {
    return null;
  }

  // Verify PIN hash using bcrypt
  const isMatch = await verifyPassword(cleanPin, challenge.pinHash);

  if (!isMatch) {
    // Increment failed attempts
    await prisma.loginPin.update({
      where: { id: challengeId },
      data: {
        attempts: { increment: 1 },
      },
    });
    return null;
  }

  // Successful verification: mark challenge as consumed
  await prisma.loginPin.update({
    where: { id: challengeId },
    data: {
      consumedAt: now,
    },
  });

  return {
    id: challenge.user.id,
    name: challenge.user.name,
    email: challenge.user.email,
    image: challenge.user.image,
  };
}
