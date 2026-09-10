"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import {
  initiateLoginVerification,
  resendLoginOTP,
} from "@/lib/auth/login-verification";

export interface RegisterState {
  success?: boolean;
  error?: string;
}

export interface LoginState {
  error?: string;
}

export interface InitiateLoginState {
  success?: boolean;
  step?: "CREDENTIALS" | "OTP_REQUIRED";
  challengeToken?: string;
  emailMasked?: string;
  error?: string;
}

/**
 * Server Action for credentials login (backward compatible wrapper).
 */
export async function loginAction(
  prevState: LoginState | null | undefined,
  formData: FormData
): Promise<LoginState | undefined> {
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const result = await initiateLoginVerification(email, password);
  if (!result.success) {
    return { error: result.error };
  }

  return undefined;
}


export interface VerifyOTPState {
  success?: boolean;
  error?: string;
}

export interface ResendOTPState {
  success?: boolean;
  message?: string;
  error?: string;
}

/**
 * Step 1: Validates email and password credentials.
 * If valid, generates a 6-digit verification code, delivers it to the user's
 * registered email address, and returns a signed challenge token for Step 2.
 */
export async function initiateLoginAction(
  emailInput?: string,
  passwordInput?: string
): Promise<InitiateLoginState> {
  const email = emailInput?.toLowerCase().trim();
  const password = passwordInput;

  if (!email || !password) {
    return { success: false, error: "Please enter your email and password." };
  }

  const result = await initiateLoginVerification(email, password);

  if (!result.success) {
    return {
      success: false,
      error: result.error || "Invalid email or password. Please check your credentials.",
    };
  }

  return {
    success: true,
    step: "OTP_REQUIRED",
    challengeToken: result.challengeToken,
    emailMasked: result.emailMasked,
  };
}

/**
 * Step 2: Verifies the 6-digit OTP code against the database.
 * If valid, consumes the token and signs the user in via NextAuth.
 */
export async function verifyLoginOTPAction(
  challengeToken?: string,
  otpCode?: string,
  redirectTo: string = "/dashboard"
): Promise<VerifyOTPState> {
  if (!challengeToken || !otpCode) {
    return { success: false, error: "Please enter the 6-digit verification code." };
  }

  const cleanOtp = otpCode.trim();
  if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return { success: false, error: "Verification code must be exactly 6 digits." };
  }

  try {
    await signIn("credentials", {
      challengeToken,
      otpCode: cleanOtp,
      redirectTo,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid or expired verification code. Please try again." };
        default:
          return { error: "Authentication failed. Please check your verification code." };
      }
    }
    // Re-throw Next.js redirection exception
    throw error;
  }
}

/**
 * Resends a new 6-digit verification code to the user's email address,
 * subject to a 60-second cooldown and hourly limit.
 */
export async function resendLoginOTPAction(
  challengeToken?: string
): Promise<ResendOTPState> {
  if (!challengeToken) {
    return { success: false, error: "Active login session required." };
  }

  const result = await resendLoginOTP(challengeToken);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, message: result.message };
}


/**
 * Helper to generate a URL-friendly slug from a business name.
 */
function slugify(text: string): string {
  const base = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
  return base || `biz-${Date.now()}`;
}

/**
 * Server Action for new user & business registration.
 * Creates User, Business, and an OWNER Membership in an atomic transaction.
 */
export async function registerAction(
  prevState: RegisterState | null,
  formData: FormData
): Promise<RegisterState> {
  try {
    const name = formData.get("name")?.toString().trim();
    const email = formData.get("email")?.toString().toLowerCase().trim();
    const password = formData.get("password")?.toString();
    const businessName = formData.get("businessName")?.toString().trim();
    const currency = formData.get("currency")?.toString().trim() || "NGN";

    if (!name || name.length < 2) {
      return { error: "Please enter a valid full name (at least 2 characters)." };
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "Please enter a valid email address." };
    }

    if (!password || password.length < 8) {
      return { error: "Password must be at least 8 characters long." };
    }

    if (!businessName || businessName.length < 2) {
      return { error: "Please enter a valid business name (at least 2 characters)." };
    }

    // Check if email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { error: "An account with this email address already exists." };
    }

    // Hash password securely using bcrypt
    const hashedPassword = await hashPassword(password);

    // Create unique slug for business
    const baseSlug = slugify(businessName);
    let finalSlug = baseSlug;
    let counter = 1;
    while (await prisma.business.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Atomic transaction creating User, Business, and OWNER Membership
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          emailVerified: new Date(),
        },
      });

      const business = await tx.business.create({
        data: {
          name: businessName,
          slug: finalSlug,
          currency: currency.toUpperCase(),
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: "OWNER",
        },
      });
    });

    return { success: true };
  } catch (error) {
    console.error("Registration error:", error);
    return { error: "An unexpected error occurred during registration. Please try again." };
  }
}
