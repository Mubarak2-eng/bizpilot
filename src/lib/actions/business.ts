"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_BUSINESS_COOKIE, requireBusinessMembership, requireBusinessRole } from "@/lib/auth-helpers";
import { Role } from "@/types/auth";

export interface ActionResult {
  success?: boolean;
  message?: string;
  error?: string;
}

/**
 * Switches the user's currently active business.
 * Validates in the DB that the user is actually a member of the target business!
 */
export async function switchActiveBusinessAction(
  businessId: string
): Promise<ActionResult> {
  try {
    // Verify membership in DB (requireBusinessMembership calls requireAuth internally)
    const context = await requireBusinessMembership(businessId);

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_BUSINESS_COOKIE, businessId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    revalidatePath("/", "layout");
    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/customers");
    revalidatePath("/sales");
    revalidatePath("/invoices");
    revalidatePath("/expenses");
    revalidatePath("/settings");

    return {
      success: true,
      message: `Switched active business to ${context.business.name}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to switch business";
    return { error: message };
  }
}

/**
 * Demo Admin Action (requires at least ADMIN role: allowed for OWNER and ADMIN, rejected for STAFF).
 */
export async function performAdminAction(
  businessId: string,
  actionDescription: string
): Promise<ActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.ADMIN);
    return {
      success: true,
      message: `[${context.role}] Successfully executed Admin Action: "${actionDescription}" for ${context.business.name}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action failed";
    return { error: message };
  }
}

/**
 * Demo Owner Action (requires OWNER role only: rejected for ADMIN and STAFF).
 */
export async function performOwnerAction(
  businessId: string,
  actionDescription: string
): Promise<ActionResult> {
  try {
    const context = await requireBusinessRole(businessId, Role.OWNER);
    return {
      success: true,
      message: `[${context.role}] Successfully executed Owner-Only Action: "${actionDescription}" for ${context.business.name}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Action failed";
    return { error: message };
  }
}
