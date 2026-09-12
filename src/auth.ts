import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyAndConsumeLoginOTP } from "@/lib/auth/login-verification";
import { recordLoginEvent } from "@/lib/auth/login-tracker";

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
    await recordLoginEvent({ userId: user.id, status: "FAILED" });
    return null;
  }

  await recordLoginEvent({ userId: user.id, status: "SUCCESS" });

  // Return sanitized user object (never expose password)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        challengeToken: { label: "Challenge Token", type: "text" },
        otpCode: { label: "Verification Code", type: "text" },
      },
      async authorize(credentials) {
        // 1. If 2-step verification OTP challenge is submitted
        if (credentials?.challengeToken && credentials?.otpCode) {
          const result = await verifyAndConsumeLoginOTP(
            String(credentials.challengeToken),
            String(credentials.otpCode)
          );
          if (result.success && result.user) {
            return result.user;
          }
          return null;
        }

        // 2. Direct password credentials (fallback / internal tests)
        return verifyUserCredentials(credentials?.email, credentials?.password);
      },
    }),
  ],
});

