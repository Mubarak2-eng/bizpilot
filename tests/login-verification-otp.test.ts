import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import * as passwordUtils from "../src/lib/password";
import * as emailModule from "../src/lib/email";
import {
  initiateLoginVerification,
  verifyAndConsumeLoginOTP,
  resendLoginOTP,
  hashLoginOTP,
  verifyLoginChallengeToken,
  generateLoginChallengeToken,
  maskEmail,
} from "../src/lib/auth/login-verification";

describe("2-Step Login Verification (Email OTP Before Login)", () => {
  const userA = {
    id: "user_alpha_123",
    name: "Alpha Business Owner",
    email: "alpha@business.ng",
    password: "$2a$10$mockPasswordHashAlpha1234567890123456789012",
  };

  const userB = {
    id: "user_beta_456",
    name: "Beta Retailer",
    email: "beta@retail.com",
    password: "$2a$10$mockPasswordHashBeta1234567890123456789012",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Email Masking & Utilities", () => {
    it("should safely mask email addresses for UI preview", () => {
      expect(maskEmail("alpha@business.ng")).toBe("a***a@business.ng");
      expect(maskEmail("mubarak@gmail.com")).toBe("m****k@gmail.com");
      expect(maskEmail("beta@retail.com")).toBe("b**a@retail.com");
      expect(maskEmail("ab@domain.com")).toBe("a*@domain.com");
    });
  });

  describe("2. Step 1: Credentials Validation & OTP Dispatch", () => {
    it("should generate 6-digit OTP and send email to the specific registered user on correct credentials", async () => {
      // Mock user lookup
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(userA as any);
      vi.spyOn(passwordUtils, "verifyPassword").mockResolvedValue(true);

      // Mock DB token creation and cleanup
      vi.spyOn(prisma.loginVerificationToken, "deleteMany").mockResolvedValue({ count: 0 });
      vi.spyOn(prisma.loginVerificationToken, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.loginVerificationToken, "updateMany").mockResolvedValue({ count: 0 });
      vi.spyOn(prisma.loginVerificationToken, "create").mockResolvedValue({
        id: "token_rec_111",
        userId: userA.id,
        tokenHash: "mock_hash_111",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Mock email sending
      const emailSpy = vi.spyOn(emailModule, "sendLoginVerificationEmail").mockResolvedValue({
        success: true,
        messageId: "msg_email_123",
      });

      const result = await initiateLoginVerification("alpha@business.ng", "CorrectPassword123!");

      expect(result.success).toBe(true);
      expect(result.requiresOTP).toBe(true);
      expect(result.challengeToken).toBeDefined();
      expect(result.emailMasked).toBe("a***a@business.ng");


      // Verify email was sent to Alpha's specific email address with 6-digit code
      expect(emailSpy).toHaveBeenCalledTimes(1);
      const emailArgs = emailSpy.mock.calls[0][0];
      expect(emailArgs.to).toBe("alpha@business.ng");
      expect(emailArgs.userName).toBe("Alpha Business Owner");
      expect(emailArgs.code).toMatch(/^\d{6}$/);
    });

    it("should reject wrong password without sending any OTP email", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(userA as any);
      vi.spyOn(passwordUtils, "verifyPassword").mockResolvedValue(false);
      const emailSpy = vi.spyOn(emailModule, "sendLoginVerificationEmail");

      const result = await initiateLoginVerification("alpha@business.ng", "WrongPassword!");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid email or password");
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it("should reject non-existent email without sending any OTP email", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);
      const emailSpy = vi.spyOn(emailModule, "sendLoginVerificationEmail");

      const result = await initiateLoginVerification("nonexistent@domain.com", "Password123!");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid email or password");
      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  describe("3. Step 2: OTP Verification & Single-Use Consumption", () => {
    it("should verify correct 6-digit OTP, consume token, and return authenticated user", async () => {
      const validCode = "654321";
      const validHash = hashLoginOTP(validCode);
      const tokenId = "token_test_abc";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: validHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        user: {
          id: userA.id,
          name: userA.name,
          email: userA.email,
          image: null,
        },
      } as any);

      const updateSpy = vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);

      const result = await verifyAndConsumeLoginOTP(challengeToken, validCode);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe(userA.id);
      expect(result.user?.email).toBe(userA.email);

      // Verify token was marked as consumed
      expect(updateSpy).toHaveBeenCalled();
      const updateArgs = updateSpy.mock.calls[0][0];
      expect(updateArgs.where.id).toBe(tokenId);
      expect(updateArgs.data.consumedAt).toBeDefined();
    });

    it("should reject incorrect OTP and increment attempt counter", async () => {
      const correctCode = "123456";
      const wrongCode = "999999";
      const validHash = hashLoginOTP(correctCode);
      const tokenId = "token_test_attempts";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: validHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 1,
        consumedAt: null,
        user: userA as any,
      } as any);

      const updateSpy = vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);

      const result = await verifyAndConsumeLoginOTP(challengeToken, wrongCode);

      expect(result.success).toBe(false);
      expect(result.error).toContain("3 attempt(s) remaining");

      // Verify attempts counter was incremented to 2
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: tokenId },
        data: { attempts: 2 },
      });
    });

    it("should reject expired OTP (>10 minutes)", async () => {
      const code = "123456";
      const tokenId = "token_expired_123";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: hashLoginOTP(code),
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        attempts: 0,
        consumedAt: null,
        user: userA as any,
      } as any);

      const result = await verifyAndConsumeLoginOTP(challengeToken, code);

      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should prevent replay attacks by rejecting already consumed OTP tokens", async () => {
      const code = "123456";
      const tokenId = "token_already_consumed";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: hashLoginOTP(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: new Date(Date.now() - 60000), // Consumed 1 minute ago
        user: userA as any,
      } as any);

      const result = await verifyAndConsumeLoginOTP(challengeToken, code);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already been used");
    });

    it("should enforce maximum 5 attempts and lock out session", async () => {
      const tokenId = "token_max_attempts";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: hashLoginOTP("123456"),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 5, // Already reached max
        consumedAt: null,
        user: userA as any,
      } as any);

      const updateSpy = vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);

      const result = await verifyAndConsumeLoginOTP(challengeToken, "999999");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum verification attempts exceeded");
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe("4. Resend Protection & Rate Limiting", () => {
    it("should block resend if within 60-second cooldown period", async () => {
      const tokenId = "token_cooldown_check";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: "hash_123",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        updatedAt: new Date(Date.now() - 20 * 1000), // Updated 20 seconds ago
        user: userA as any,
      } as any);

      const result = await resendLoginOTP(challengeToken);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Please wait");
      expect(result.error).toContain("before requesting another code");
    });

    it("should allow resend after 60-second cooldown expires", async () => {
      const tokenId = "token_cooldown_passed";

      const challengeToken = generateLoginChallengeToken({
        userId: userA.id,
        email: userA.email,
        tokenId,
      });

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue({
        id: tokenId,
        userId: userA.id,
        tokenHash: "hash_old",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 2,
        consumedAt: null,
        updatedAt: new Date(Date.now() - 65 * 1000), // Updated 65s ago (cooldown expired)
        user: userA as any,
      } as any);

      vi.spyOn(prisma.loginVerificationToken, "count").mockResolvedValue(1);
      vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);
      const emailSpy = vi.spyOn(emailModule, "sendLoginVerificationEmail").mockResolvedValue({ success: true });

      const result = await resendLoginOTP(challengeToken);

      expect(result.success).toBe(true);
      expect(result.message).toContain("New verification code sent");
      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: userA.email,
        })
      );
    });
  });

  describe("5. Multi-User Isolation", () => {
    it("should independently support multiple distinct users without cross-contamination", async () => {
      // User B initiating login
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(userB as any);
      vi.spyOn(passwordUtils, "verifyPassword").mockResolvedValue(true);
      vi.spyOn(prisma.loginVerificationToken, "deleteMany").mockResolvedValue({ count: 0 });
      vi.spyOn(prisma.loginVerificationToken, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.loginVerificationToken, "updateMany").mockResolvedValue({ count: 0 });
      vi.spyOn(prisma.loginVerificationToken, "create").mockResolvedValue({
        id: "token_user_b",
        userId: userB.id,
        tokenHash: hashLoginOTP("888777"),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      } as any);

      const emailSpy = vi.spyOn(emailModule, "sendLoginVerificationEmail").mockResolvedValue({ success: true });

      const result = await initiateLoginVerification("beta@retail.com", "BetaPassword123!");

      expect(result.success).toBe(true);
      expect(result.emailMasked).toBe("b**a@retail.com");


      // Verify email was sent specifically to User B (not User A)
      expect(emailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "beta@retail.com",
          userName: "Beta Retailer",
        })
      );
    });
  });
});
