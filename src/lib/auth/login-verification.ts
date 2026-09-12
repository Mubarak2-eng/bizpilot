import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { sendLoginVerificationEmail } from "@/lib/email";
import { recordLoginEvent } from "@/lib/auth/login-tracker";

export const LOGIN_OTP_EXPIRY_MINUTES = 10;
export const MAX_LOGIN_OTP_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_HOURLY_RESENDS = 5;
export const CHALLENGE_TOKEN_TTL_MS = LOGIN_OTP_EXPIRY_MINUTES * 60 * 1000;

export interface LoginChallengePayload {
  userId: string;
  email: string;
  tokenId: string;
  timestamp: number;
  nonce: string;
}

/**
 * Resolves the signing secret for cryptographic challenge tokens.
 */
function getChallengeSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    "bizpilot_login_verification_secret_2026"
  );
}

/**
 * Masks an email for safe display on the client (e.g., m***k@gmail.com).
 */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const first = local[0];
  const last = local[local.length - 1];
  const masked = "*".repeat(Math.min(local.length - 2, 4));
  return `${first}${masked}${last}@${domain}`;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generateLoginOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Computes an HMAC-SHA256 hash of the OTP for safe database storage.
 * The raw OTP is NEVER stored in plaintext.
 */
export function hashLoginOTP(otp: string, secret?: string): string {
  const key = secret || getChallengeSecret();
  return crypto.createHmac("sha256", key).update(otp.trim()).digest("hex");
}

/**
 * Constant-time verification of raw OTP against the stored hash.
 */
export function verifyLoginOTPHash(rawOtp: string, storedHash: string, secret?: string): boolean {
  if (!rawOtp || !storedHash) return false;
  const computed = hashLoginOTP(rawOtp, secret);
  const bufA = Buffer.from(computed, "hex");
  const bufB = Buffer.from(storedHash, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a signed, tamper-proof challenge token containing userId and tokenId.
 */
export function generateLoginChallengeToken(payload: Omit<LoginChallengePayload, "timestamp" | "nonce">): string {
  const fullPayload: LoginChallengePayload = {
    ...payload,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  const secret = getChallengeSecret();
  const signature = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies the signature and expiration of a login challenge token.
 */
export function verifyLoginChallengeToken(tokenString?: string | null): {
  valid: boolean;
  data?: LoginChallengePayload;
  error?: string;
} {
  if (!tokenString || typeof tokenString !== "string") {
    return { valid: false, error: "Challenge token is required." };
  }

  const parts = tokenString.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed challenge token structure." };
  }

  const [payloadBase64, signature] = parts;
  const secret = getChallengeSecret();
  const expectedSignature = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expectedSignature, "utf8");

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Invalid challenge signature (tampering detected)." };
  }

  try {
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as LoginChallengePayload;

    if (!payload.userId || !payload.email || !payload.tokenId || !payload.timestamp) {
      return { valid: false, error: "Challenge payload missing required security fields." };
    }

    const now = Date.now();
    if (now - payload.timestamp > CHALLENGE_TOKEN_TTL_MS) {
      return { valid: false, error: "Login challenge has expired. Please sign in again." };
    }

    return { valid: true, data: payload };
  } catch {
    return { valid: false, error: "Failed to decode challenge payload." };
  }
}

export interface InitiateLoginResult {
  success: boolean;
  requiresOTP?: boolean;
  challengeToken?: string;
  emailMasked?: string;
  error?: string;
}

/**
 * Step 1: Validates user credentials. If valid, generates a 6-digit OTP,
 * persists the hashed token, dispatches the email to the user's email address,
 * and returns the signed challenge token.
 */
export async function initiateLoginVerification(
  emailInput: string,
  passwordInput: string
): Promise<InitiateLoginResult> {
  const email = emailInput.toLowerCase().trim();
  const password = passwordInput;

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  // Look up user by email
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
    return { success: false, error: "Invalid email or password. Please check your credentials." };
  }

  // Validate bcrypt password hash
  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    return { success: false, error: "Invalid email or password. Please check your credentials." };
  }

  // Rate limiting / abuse prevention: Clean up expired tokens for this user
  await prisma.loginVerificationToken.deleteMany({
    where: {
      userId: user.id,
      expiresAt: { lt: new Date() },
    },
  });

  // Check recent active tokens for resend cooldown
  const recentToken = await prisma.loginVerificationToken.findFirst({
    where: {
      userId: user.id,
      consumedAt: null,
      createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentToken) {
    const elapsedSeconds = Math.floor((Date.now() - recentToken.createdAt.getTime()) / 1000);
    const waitSeconds = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
    if (waitSeconds > 0) {
      return {
        success: false,
        error: `A verification code was recently sent. Please wait ${waitSeconds}s before requesting a new one.`,
      };
    }
  }

  // Generate 6-digit OTP code and secure HMAC hash
  const rawOtp = generateLoginOTP();
  const otpHash = hashLoginOTP(rawOtp);
  const expiresAt = new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any prior unconsumed tokens for this user to enforce single-active token
  await prisma.loginVerificationToken.updateMany({
    where: {
      userId: user.id,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  // Create new active verification token
  const tokenRecord = await prisma.loginVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: otpHash,
      expiresAt,
      attempts: 0,
    },
  });

  // Dispatch security email with 6-digit code to user's registered email
  const emailResult = await sendLoginVerificationEmail({
    to: user.email,
    userName: user.name,
    code: rawOtp,
  });

  if (!emailResult.success) {
    console.error(`[Login Verification] Failed to send OTP email to ${user.email}:`, emailResult.error);
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        error: "Unable to deliver verification code to your email. Please try again or contact support.",
      };
    }
  }

  // Create signed challenge token for client
  const challengeToken = generateLoginChallengeToken({
    userId: user.id,
    email: user.email,
    tokenId: tokenRecord.id,
  });

  return {
    success: true,
    requiresOTP: true,
    challengeToken,
    emailMasked: maskEmail(user.email),
  };
}

export interface ResendLoginOTPResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Resends a 6-digit login OTP code to the user's email, enforcing cooldown and hourly limits.
 */
export async function resendLoginOTP(challengeToken: string): Promise<ResendLoginOTPResult> {
  const verification = verifyLoginChallengeToken(challengeToken);
  if (!verification.valid || !verification.data) {
    return { success: false, error: verification.error || "Invalid or expired login session." };
  }

  const { userId, tokenId } = verification.data;


  const currentToken = await prisma.loginVerificationToken.findUnique({
    where: { id: tokenId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!currentToken || currentToken.userId !== userId) {
    return { success: false, error: "Login session not found. Please sign in again." };
  }

  if (currentToken.consumedAt) {
    return { success: false, error: "This login session has already been completed. Please sign in again." };
  }

  // Enforce 60s cooldown
  const elapsedSeconds = Math.floor((Date.now() - currentToken.updatedAt.getTime()) / 1000);
  if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
    const remaining = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
    return { success: false, error: `Please wait ${remaining}s before requesting another code.` };
  }

  // Enforce max hourly resends
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourlyCount = await prisma.loginVerificationToken.count({
    where: {
      userId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (hourlyCount >= MAX_HOURLY_RESENDS + 5) {
    return {
      success: false,
      error: "Too many verification attempts. Please try again in one hour.",
    };
  }

  // Generate new OTP and update token record
  const rawOtp = generateLoginOTP();
  const otpHash = hashLoginOTP(rawOtp);
  const expiresAt = new Date(Date.now() + LOGIN_OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.loginVerificationToken.update({
    where: { id: tokenId },
    data: {
      tokenHash: otpHash,
      expiresAt,
      attempts: 0,
      updatedAt: new Date(),
    },
  });

  // Send new code
  const emailResult = await sendLoginVerificationEmail({
    to: currentToken.user.email,
    userName: currentToken.user.name,
    code: rawOtp,
  });

  if (!emailResult.success && process.env.NODE_ENV === "production") {
    return { success: false, error: "Failed to send verification email. Please try again." };
  }

  return { success: true, message: `New verification code sent to ${maskEmail(currentToken.user.email)}.` };
}

export interface VerifyOTPResult {
  success: boolean;
  user?: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  error?: string;
}

/**
 * Verifies the 6-digit OTP code against the database.
 * Enforces attempt limits (max 5), expiration (10 mins), and single-use consumption.
 */
export async function verifyAndConsumeLoginOTP(
  challengeToken: string,
  otpCode: string
): Promise<VerifyOTPResult> {
  const verification = verifyLoginChallengeToken(challengeToken);
  if (!verification.valid || !verification.data) {
    return { success: false, error: verification.error || "Login challenge token is invalid or expired." };
  }

  const { userId, tokenId } = verification.data;
  const cleanOtp = otpCode.trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return { success: false, error: "Please enter a valid 6-digit numeric verification code." };
  }

  const tokenRecord = await prisma.loginVerificationToken.findUnique({
    where: { id: tokenId },
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

  if (!tokenRecord || tokenRecord.userId !== userId) {
    return { success: false, error: "Invalid verification session. Please sign in again." };
  }

  if (tokenRecord.consumedAt) {
    return { success: false, error: "This verification code has already been used. Please sign in again." };
  }

  if (new Date() > tokenRecord.expiresAt) {
    return { success: false, error: "Verification code has expired. Please request a new code." };
  }

  if (tokenRecord.attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
    // Invalidate token
    await prisma.loginVerificationToken.update({
      where: { id: tokenId },
      data: { consumedAt: new Date() },
    });
    return {
      success: false,
      error: "Maximum verification attempts exceeded. Please start sign-in again.",
    };
  }

  // Verify hash using constant-time comparison
  const isMatch = verifyLoginOTPHash(cleanOtp, tokenRecord.tokenHash);

  if (!isMatch) {
    // Record failed login audit event (never advances lastLoginAt)
    await recordLoginEvent({
      userId: tokenRecord.user.id,
      status: "FAILED",
    });

    const updatedAttempts = tokenRecord.attempts + 1;
    await prisma.loginVerificationToken.update({
      where: { id: tokenId },
      data: { attempts: updatedAttempts },
    });

    const remainingAttempts = MAX_LOGIN_OTP_ATTEMPTS - updatedAttempts;
    if (remainingAttempts <= 0) {
      await prisma.loginVerificationToken.update({
        where: { id: tokenId },
        data: { consumedAt: new Date() },
      });
      return {
        success: false,
        error: "Maximum verification attempts exceeded. Please sign in again.",
      };
    }

    return {
      success: false,
      error: `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`,
    };
  }

  // Successfully matched — mark as consumed (single-use)
  await prisma.loginVerificationToken.update({
    where: { id: tokenId },
    data: { consumedAt: new Date() },
  });

  // Record successful login audit event & advance user.lastLoginAt
  await recordLoginEvent({
    userId: tokenRecord.user.id,
    status: "SUCCESS",
  });

  return {
    success: true,
    user: tokenRecord.user,
  };
}
