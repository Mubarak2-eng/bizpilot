import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyLoginPinChallenge } from "@/lib/auth/login-pin";

/**
 * Core credential verification logic for NextAuth credentials provider.
 * Validates email and bcrypt password hash against the database.
 */
export async function verifyUserCredentials(
  emailInput?: unknown,
  passwordInput?: unknown
) {
  if (!emailInput || !passwordInput) {
    return null;
  }

  const email = String(emailInput).toLowerCase().trim();
  const password = String(passwordInput);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      password: true,
    },
  });

  if (!user || !user.password) {
    return null;
  }

  const isPasswordValid = await verifyPassword(password, user.password);
  if (!isPasswordValid) {
    return null;
  }

  // Return sanitized user object (never expose password)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

/**
 * Authorizes credentials submitted to NextAuth.
 * In production, strictly requires challengeId + pin (Email Login PIN Challenge).
 * In development/test, permits direct email + password for backward compatibility.
 */
export async function authorizeCredentials(
  credentials?: Record<string, unknown> | null
) {
  // 1. Email Verification PIN Challenge
  if (credentials?.challengeId && credentials?.pin) {
    return verifyLoginPinChallenge(
      String(credentials.challengeId),
      String(credentials.pin)
    );
  }

  // 2. Direct Credentials (STRICTLY non-production only: for local testing & development)
  if (
    process.env.NODE_ENV !== "production" &&
    credentials?.email &&
    credentials?.password
  ) {
    return verifyUserCredentials(credentials.email, credentials.password);
  }

  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        challengeId: { label: "Challenge ID", type: "text" },
        pin: { label: "Verification PIN", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return authorizeCredentials(credentials as Record<string, unknown>);
      },
    }),
  ],
});


