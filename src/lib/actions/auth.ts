"use server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export interface RegisterState {
  success?: boolean;
  error?: string;
}

export interface LoginState {
  error?: string;
}

/**
 * Server Action for user credentials login.
 * Calls Auth.js signIn on the server with zero client-side CSRF dependencies.
 */
export async function loginAction(
  prevState: LoginState | null | undefined,
  formData: FormData
): Promise<LoginState | undefined> {
  const email = formData.get("email")?.toString().toLowerCase().trim();
  const password = formData.get("password")?.toString();
  const redirectTo = formData.get("redirectTo")?.toString() || "/dashboard";

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password. Please check your credentials." };
        default:
          return { error: "Authentication failed. Please check your credentials." };
      }
    }
    // Next.js redirection in Server Actions throws a special NEXT_REDIRECT error which must be re-thrown
    throw error;
  }
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
