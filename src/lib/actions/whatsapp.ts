"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";
import { normalizePhoneNumber } from "@/lib/whatsapp/security";
import { deleteWhatsAppSession } from "@/lib/whatsapp/session";
import {
  generateWhatsAppOTP,
  hashOTP,
  verifyOTPHash,
  OTP_EXPIRATION_MINUTES,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/whatsapp/otp";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/client";

export interface WhatsAppActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  status?: "IDLE" | "OTP_SENT" | "VERIFIED";
  connectionId?: string;
  phoneNumber?: string;
  isPendingVerification?: boolean;
}

/**
 * Step 1: Initiates WhatsApp phone verification.
 * Generates a 6-digit OTP, stores its HMAC hash with expiry, and dispatches via WhatsApp.
 * The number is NOT marked as verified until the user submits the correct OTP.
 */
export async function requestWhatsAppLinkAction(
  businessId: string,
  formData: FormData
): Promise<WhatsAppActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const rawPhone = formData.get("phoneNumber")?.toString().trim();
    if (!rawPhone) {
      return { error: "Please enter a valid phone number." };
    }

    const normalizedPhone = normalizePhoneNumber(rawPhone);
    if (!normalizedPhone || normalizedPhone.length < 8 || normalizedPhone.length > 15) {
      return {
        error: "Invalid phone number format. Please provide a valid international or local mobile number (8-15 digits).",
      };
    }

    // Check if this phone number is already verified by another business (Tenant Collision Guard)
    const existingOther = await prisma.whatsAppConnection.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: { business: true },
    });

    if (existingOther && existingOther.businessId !== context.business.id && existingOther.verified) {
      return {
        error: `This WhatsApp number (+${normalizedPhone}) is already connected to another business. Please unlink it there first or use a different number.`,
      };
    }

    // Check resend cooldown for the current business
    const existingCurrent = await prisma.whatsAppConnection.findFirst({
      where: { businessId: context.business.id },
    });

    if (
      existingCurrent?.verificationRequestedAt &&
      Date.now() - existingCurrent.verificationRequestedAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - existingCurrent.verificationRequestedAt.getTime())) / 1000
      );
      return {
        error: `Please wait ${waitSeconds} second(s) before requesting a new code.`,
      };
    }

    // Generate secure 6-digit OTP and compute hash
    const rawOtp = generateWhatsAppOTP();
    const otpHash = hashOTP(rawOtp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

    // If business had an older unverified connection with a different number, delete it
    if (existingCurrent && existingCurrent.phoneNumber !== normalizedPhone) {
      await prisma.whatsAppConnection.delete({
        where: { id: existingCurrent.id },
      });
      await deleteWhatsAppSession(existingCurrent.phoneNumber);
    }

    // Upsert pending connection (verified = false)
    const connection = await prisma.whatsAppConnection.upsert({
      where: { phoneNumber: normalizedPhone },
      create: {
        phoneNumber: normalizedPhone,
        userId: context.user.id,
        businessId: context.business.id,
        verified: false,
        verificationCodeHash: otpHash,
        verificationExpiresAt: expiresAt,
        verificationAttempts: 0,
        verificationRequestedAt: new Date(),
      },
      update: {
        userId: context.user.id,
        businessId: context.business.id,
        verified: false,
        verificationCodeHash: otpHash,
        verificationExpiresAt: expiresAt,
        verificationAttempts: 0,
        verificationRequestedAt: new Date(),
      },
    });

    // Send OTP via Meta WhatsApp Cloud API
    const messageText = `🔐 *BizPilot Verification Code*\n\nYour 6-digit verification code for *${context.business.name}* is:\n\n👉 *${rawOtp}*\n\nThis code expires in ${OTP_EXPIRATION_MINUTES} minutes. Never share this code with anyone.`;
    await sendWhatsAppTextMessage(normalizedPhone, messageText);

    revalidatePath("/settings");

    return {
      success: true,
      message: "Verification code sent.",
      status: "OTP_SENT",
      connectionId: connection.id,
      phoneNumber: connection.phoneNumber,
      isPendingVerification: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initiate WhatsApp verification.";
    return { error: message };
  }
}

/**
 * Step 2: Verifies submitted 6-digit OTP code against the stored hash.
 * Marks verified = true and clears OTP fields upon successful matching.
 */
export async function verifyWhatsAppOTPAction(
  businessId: string,
  formData: FormData
): Promise<WhatsAppActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const rawCode = formData.get("code")?.toString().trim() || formData.get("otp")?.toString().trim();
    if (!rawCode || rawCode.length !== 6) {
      return { error: "Please enter the complete 6-digit verification code." };
    }

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { businessId: context.business.id },
    });

    if (!connection || !connection.verificationCodeHash) {
      return { error: "No pending verification found. Please enter your phone number first." };
    }

    if (connection.verified) {
      return {
        success: true,
        message: "WhatsApp number is already verified.",
        status: "VERIFIED",
        phoneNumber: connection.phoneNumber,
      };
    }

    // Check expiry
    if (connection.verificationExpiresAt && new Date() > connection.verificationExpiresAt) {
      return { error: "Code expired. Request a new code." };
    }

    // Check maximum attempts
    if (connection.verificationAttempts >= MAX_OTP_ATTEMPTS) {
      return { error: "Too many attempts. Request a new code." };
    }

    // Constant-time OTP verification
    const isValid = verifyOTPHash(rawCode, connection.verificationCodeHash);
    if (!isValid) {
      await prisma.whatsAppConnection.update({
        where: { id: connection.id },
        data: { verificationAttempts: { increment: 1 } },
      });

      const remainingAttempts = MAX_OTP_ATTEMPTS - (connection.verificationAttempts + 1);
      if (remainingAttempts <= 0) {
        return { error: "Too many attempts. Request a new code." };
      }
      return { error: "Invalid verification code." };
    }

    // Verification Success: activate connection
    await prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        verified: true,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        verificationAttempts: 0,
      },
    });

    revalidatePath("/settings");

    return {
      success: true,
      message: "WhatsApp number verified successfully.",
      status: "VERIFIED",
      phoneNumber: connection.phoneNumber,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to verify WhatsApp code.";
    return { error: message };
  }
}

/**
 * Legacy alias for backwards compatibility: initiates link with OTP flow.
 */
export async function linkWhatsAppNumberAction(
  businessId: string,
  formData: FormData
): Promise<WhatsAppActionResult> {
  return requestWhatsAppLinkAction(businessId, formData);
}

/**
 * Retrieves the current WhatsApp connection state for a business.
 */
export async function getWhatsAppStatusAction(businessId: string) {
  try {
    const context = await requireBusinessRole(businessId, Role.MEMBER);

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { businessId: context.business.id },
    });

    if (!connection) {
      return {
        isConnected: false,
        verified: false,
        phoneNumber: null,
        pendingVerification: false,
      };
    }

    return {
      isConnected: true,
      verified: connection.verified,
      phoneNumber: connection.phoneNumber,
      pendingVerification: !connection.verified && Boolean(connection.verificationCodeHash),
    };
  } catch (err: unknown) {
    return {
      isConnected: false,
      verified: false,
      phoneNumber: null,
      pendingVerification: false,
      error: err instanceof Error ? err.message : "Failed to fetch status",
    };
  }
}

/**
 * Unlinks / disconnects the WhatsApp phone number from the active business.
 */
export async function unlinkWhatsAppNumberAction(
  businessId: string
): Promise<WhatsAppActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { businessId: context.business.id },
    });

    if (!connection) {
      return { error: "No active WhatsApp connection found for this business." };
    }

    await prisma.whatsAppConnection.delete({
      where: { id: connection.id },
    });

    await deleteWhatsAppSession(connection.phoneNumber);

    revalidatePath("/settings");

    return {
      success: true,
      message: `WhatsApp number +${connection.phoneNumber} has been disconnected from ${context.business.name}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to disconnect WhatsApp number.";
    return { error: message };
  }
}
