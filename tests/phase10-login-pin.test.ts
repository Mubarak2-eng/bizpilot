import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  createLoginChallenge,
  resendLoginPin,
  verifyLoginPinChallenge,
  generateSecurePin,
  maskEmail,
} from "../src/lib/auth/login-pin";
import { verifyUserCredentials, authorizeCredentials } from "../src/auth";
import { sendEmail } from "../src/lib/email";
import { hashPassword } from "../src/lib/password";


describe("Phase 10: Email Login Verification PIN & Transactional Email Engine", () => {
  let demoUser: { id: string; email: string };
  const demoEmail = "demo@bizpilot.test";
  const demoPassword = "DemoPassword123!";

  beforeAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (!user) {
      throw new Error("Demo user not found. Please run seed first.");
    }
    demoUser = user;
  });

  afterAll(async () => {
    try {
      // Clean up all login pins created during testing
      await prisma.loginPin.deleteMany({
        where: { userId: demoUser.id },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe("1. Security: PIN Generation & Email Masking", () => {
    it("should generate a cryptographically secure 6-digit numeric PIN", () => {
      for (let i = 0; i < 50; i++) {
        const pin = generateSecurePin();
        expect(pin).toMatch(/^\d{6}$/);
        const pinNum = parseInt(pin, 10);
        expect(pinNum).toBeGreaterThanOrEqual(100000);
        expect(pinNum).toBeLessThan(1000000);
      }
    });

    it("should mask email correctly to prevent information disclosure", () => {
      expect(maskEmail("demo@bizpilot.test")).toBe("d***o@b***t.test");
      expect(maskEmail("a@b.com")).toBe("a***@b***.com");
      expect(maskEmail("john.doe@company.org")).toBe("j***e@c***y.org");
    });
  });

  describe("2. Step 1: Login Challenge Initiation", () => {
    it("should reject login challenge with incorrect password without creating PIN", async () => {
      const result = await createLoginChallenge(demoEmail, "WrongPassword999!");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid email or password/i);
      expect(result.challengeId).toBeUndefined();
    });

    it("should reject login challenge for non-existent email without creating PIN", async () => {
      const result = await createLoginChallenge("nonexistent_user_xyz@bizpilot.test", "AnyPass123!");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid email or password/i);
    });

    it("should create challenge and store PIN as bcrypt hash (NEVER plaintext)", async () => {
      const result = await createLoginChallenge(demoEmail, demoPassword);
      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.cooldownSeconds).toBe(60);

      const record = await prisma.loginPin.findUnique({
        where: { id: result.challengeId! },
      });

      expect(record).toBeDefined();
      expect(record?.userId).toBe(demoUser.id);
      expect(record?.consumedAt).toBeNull();
      expect(record?.attempts).toBe(0);

      // Verify PIN hash signature ($2a$ or $2b$ bcrypt) and not a 6 digit plain string
      expect(record?.pinHash).toBeDefined();
      expect(record?.pinHash.startsWith("$2")).toBe(true);
      expect(record?.pinHash.length).toBeGreaterThanOrEqual(50);
      expect(record?.pinHash).not.toMatch(/^\d{6}$/);
    });
  });

  describe("3. Step 2: Verification, Consumption & Brute-Force Protection", () => {
    let activeChallengeId = "";
    const testPin = "482910";

    beforeAll(async () => {
      // Create a test challenge with a known hashed pin
      const { hashPassword } = await import("../src/lib/password");
      const pinHash = await hashPassword(testPin);

      const challenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
          attempts: 0,
          maxAttempts: 5,
          resendCooldownUntil: new Date(Date.now() + 60 * 1000),
        },
      });
      activeChallengeId = challenge.id;
    });

    it("should reject incorrect PIN and increment attempt count", async () => {
      const result = await verifyLoginPinChallenge(activeChallengeId, "000000");
      expect(result).toBeNull();

      const record = await prisma.loginPin.findUnique({ where: { id: activeChallengeId } });
      expect(record?.attempts).toBe(1);
    });

    it("should reject malformed or non-6-digit PIN inputs", async () => {
      expect(await verifyLoginPinChallenge(activeChallengeId, "123")).toBeNull();
      expect(await verifyLoginPinChallenge(activeChallengeId, "abcdef")).toBeNull();
      expect(await verifyLoginPinChallenge(activeChallengeId, "")).toBeNull();
    });

    it("should authenticate and return sanitized user when correct PIN is provided", async () => {
      const user = await verifyLoginPinChallenge(activeChallengeId, testPin);
      expect(user).toBeDefined();
      expect(user?.id).toBe(demoUser.id);
      expect(user?.email).toBe(demoUser.email);
      expect((user as any)?.password).toBeUndefined(); // Never expose password

      // Verify challenge is marked consumed
      const record = await prisma.loginPin.findUnique({ where: { id: activeChallengeId } });
      expect(record?.consumedAt).not.toBeNull();
    });

    it("should reject reuse of an already-consumed PIN (single-use invariant)", async () => {
      const secondAttempt = await verifyLoginPinChallenge(activeChallengeId, testPin);
      expect(secondAttempt).toBeNull();
    });

    it("should reject expired PIN challenges", async () => {
      const { hashPassword } = await import("../src/lib/password");
      const expiredPin = "654321";
      const pinHash = await hashPassword(expiredPin);

      const expiredChallenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash,
          expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 min ago
          attempts: 0,
          maxAttempts: 5,
          resendCooldownUntil: new Date(),
        },
      });

      const result = await verifyLoginPinChallenge(expiredChallenge.id, expiredPin);
      expect(result).toBeNull();

      // Cleanup
      await prisma.loginPin.delete({ where: { id: expiredChallenge.id } });
    });

    it("should lock and reject verification once max attempts (5) are reached", async () => {
      const { hashPassword } = await import("../src/lib/password");
      const lockedPin = "777888";
      const pinHash = await hashPassword(lockedPin);

      const lockedChallenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 4, // 1 away from lock
          maxAttempts: 5,
          resendCooldownUntil: new Date(),
        },
      });

      // 5th attempt with wrong PIN -> locks challenge
      await verifyLoginPinChallenge(lockedChallenge.id, "111111");

      const recordAfter5th = await prisma.loginPin.findUnique({ where: { id: lockedChallenge.id } });
      expect(recordAfter5th?.attempts).toBe(5);

      // Now even correct PIN is rejected because attempts >= maxAttempts
      const attemptWithCorrectPin = await verifyLoginPinChallenge(lockedChallenge.id, lockedPin);
      expect(attemptWithCorrectPin).toBeNull();

      // Cleanup
      await prisma.loginPin.delete({ where: { id: lockedChallenge.id } });
    });
  });

  describe("4. Resend PIN & Server-Side Cooldown Enforcement", () => {
    let resendChallengeId = "";

    beforeAll(async () => {
      const challenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash: "sample-hash",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
          resendCooldownUntil: new Date(Date.now() + 45 * 1000), // 45s remaining cooldown
        },
      });
      resendChallengeId = challenge.id;
    });

    it("should reject resend request during active cooldown window", async () => {
      const res = await resendLoginPin(resendChallengeId);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/please wait/i);
      expect(res.cooldownSeconds).toBeGreaterThan(0);
    });

    it("should allow resend once cooldown expires, update PIN, and reset cooldown to 60s", async () => {
      // Fast forward cooldown to past
      await prisma.loginPin.update({
        where: { id: resendChallengeId },
        data: { resendCooldownUntil: new Date(Date.now() - 5000) },
      });

      const oldHash = (await prisma.loginPin.findUnique({ where: { id: resendChallengeId } }))?.pinHash;

      const res = await resendLoginPin(resendChallengeId);
      expect(res.success).toBe(true);
      expect(res.cooldownSeconds).toBe(60);

      const updated = await prisma.loginPin.findUnique({ where: { id: resendChallengeId } });
      expect(updated?.pinHash).not.toBe(oldHash);
      expect(updated?.resendCooldownUntil.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("5. Production Fail-Closed Behavior & Email Infrastructure", () => {
    it("should fail safely in production if RESEND_API_KEY is missing", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalApiKey = process.env.RESEND_API_KEY;

      try {
        (process.env as any).NODE_ENV = "production";
        delete process.env.RESEND_API_KEY;

        const result = await sendEmail({
          to: "test@example.com",
          subject: "Test Production Email",
          html: "<p>Test</p>",
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not configured in production/i);
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
        if (originalApiKey) process.env.RESEND_API_KEY = originalApiKey;
      }
    });

    it("should preserve existing verifyUserCredentials direct authentication for backward compatibility", async () => {
      const user = await verifyUserCredentials(demoEmail, demoPassword);
      expect(user).toBeDefined();
      expect(user?.email).toBe(demoEmail);
      expect(user?.name).toBe("Demo Owner");
    });
  });

  describe("6. Production NextAuth Credential Authorization & Bypass Prevention", () => {
    it("should REJECT direct email+password authentication in production", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = "production";

        const result = await authorizeCredentials({
          email: demoEmail,
          password: demoPassword,
        });

        // Direct email + password must return null in production
        expect(result).toBeNull();
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it("should ACCEPT valid challengeId + PIN in production", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const testPin = "716294";
      const pinHash = await hashPassword(testPin);

      const challenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
          resendCooldownUntil: new Date(Date.now() + 60 * 1000),
        },
      });

      try {
        (process.env as any).NODE_ENV = "production";

        const result = await authorizeCredentials({
          challengeId: challenge.id,
          pin: testPin,
        });

        expect(result).toBeDefined();
        expect(result?.email).toBe(demoEmail);
        expect(result?.name).toBe("Demo Owner");
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it("should ACCEPT direct email+password authentication in development/test environments", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = "development";

        const result = await authorizeCredentials({
          email: demoEmail,
          password: demoPassword,
        });

        expect(result).toBeDefined();
        expect(result?.email).toBe(demoEmail);
        expect(result?.name).toBe("Demo Owner");
      } finally {
        (process.env as any).NODE_ENV = originalNodeEnv;
      }
    });

    it("should ACCEPT valid challengeId + PIN in development/test environments", async () => {
      const testPin = "839102";
      const pinHash = await hashPassword(testPin);

      const challenge = await prisma.loginPin.create({
        data: {
          userId: demoUser.id,
          email: demoUser.email,
          pinHash,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
          resendCooldownUntil: new Date(Date.now() + 60 * 1000),
        },
      });

      const result = await authorizeCredentials({
        challengeId: challenge.id,
        pin: testPin,
      });

      expect(result).toBeDefined();
      expect(result?.email).toBe(demoEmail);
    });
  });
});

