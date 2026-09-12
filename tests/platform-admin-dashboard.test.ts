import "dotenv/config";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import * as authHelpers from "../src/lib/auth-helpers";
import {
  isPlatformAdminUser,
  requirePlatformAdmin,
  getPlatformAdminEmails,
} from "../src/lib/auth/admin-guard";
import {
  anonymizeIp,
  parseUserAgent,
  recordLoginEvent,
} from "../src/lib/auth/login-tracker";
import {
  getPlatformOverviewStats,
  getPlatformUsersPaginated,
  togglePlatformAdminAction,
} from "../src/lib/actions/admin";
import {
  verifyAndConsumeLoginOTP,
  generateLoginChallengeToken,
  hashLoginOTP,
} from "../src/lib/auth/login-verification";
import { UnauthorizedError, ForbiddenError } from "../src/types/auth";

describe("Owner-Only Platform Admin Dashboard & Login Tracking", () => {
  const mockPlatformOwner = {
    id: "user_owner_001",
    name: "BizPilot Owner",
    email: "owner@bizpilot.name.ng",
    isPlatformAdmin: true,
  };

  const mockNormalOwner = {
    id: "user_tenant_002",
    name: "Retail Shop Owner",
    email: "retailer@shop.ng",
    isPlatformAdmin: false,
  };

  const mockStaffUser = {
    id: "user_staff_003",
    name: "Store Staff",
    email: "staff@shop.ng",
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PLATFORM_ADMIN_EMAILS = "owner@bizpilot.ng,superadmin@bizpilot.ai";
  });

  describe("1. Platform Admin Security & Authorization Guard", () => {
    it("should authorize users with isPlatformAdmin === true", () => {
      expect(isPlatformAdminUser({ isPlatformAdmin: true, email: "someone@test.com" })).toBe(true);
    });

    it("should authorize users matching PLATFORM_ADMIN_EMAILS config", () => {
      expect(isPlatformAdminUser({ isPlatformAdmin: false, email: "owner@bizpilot.ng" })).toBe(true);
      expect(isPlatformAdminUser({ isPlatformAdmin: false, email: "superadmin@bizpilot.ai" })).toBe(true);
    });

    it("should strictly deny regular business owners and staff", () => {
      expect(isPlatformAdminUser(mockNormalOwner)).toBe(false);
      expect(isPlatformAdminUser(mockStaffUser)).toBe(false);
      expect(isPlatformAdminUser({ isPlatformAdmin: false, email: "random@business.com" })).toBe(false);
    });

    it("should deny null, undefined, or missing email objects", () => {
      expect(isPlatformAdminUser(null)).toBe(false);
      expect(isPlatformAdminUser(undefined)).toBe(false);
      expect(isPlatformAdminUser({ isPlatformAdmin: false, email: null })).toBe(false);
    });

    it("requirePlatformAdmin should throw UnauthorizedError for unauthenticated callers", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(null);

      await expect(requirePlatformAdmin()).rejects.toThrow(UnauthorizedError);
    });

    it("requirePlatformAdmin should throw ForbiddenError for non-admin users", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockNormalOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockNormalOwner.id,
        name: mockNormalOwner.name,
        email: mockNormalOwner.email,
        image: null,
        isPlatformAdmin: false,
      } as any);

      await expect(requirePlatformAdmin()).rejects.toThrow(ForbiddenError);
    });

    it("requirePlatformAdmin should succeed and return context for verified platform owners", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockPlatformOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockPlatformOwner.id,
        name: mockPlatformOwner.name,
        email: mockPlatformOwner.email,
        image: null,
        isPlatformAdmin: true,
      } as any);

      const context = await requirePlatformAdmin();
      expect(context.user.id).toBe(mockPlatformOwner.id);
      expect(context.user.isPlatformAdmin).toBe(true);
    });
  });

  describe("2. Privacy-Preserving Login Tracking & IP Anonymization", () => {
    it("should produce deterministic privacy hashes for IP addresses and never expose raw IPs", () => {
      const hashA = anonymizeIp("197.210.54.12");
      const hashB = anonymizeIp("197.210.54.12");
      const hashC = anonymizeIp("102.89.33.1");

      expect(hashA).toMatch(/^hash:[a-f0-9]{12}$/);
      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
      expect(hashA).not.toContain("197.210.54.12");
    });

    it("should return null for empty or invalid IPs", () => {
      expect(anonymizeIp(null)).toBeNull();
      expect(anonymizeIp(undefined)).toBeNull();
      expect(anonymizeIp("")).toBeNull();
      expect(anonymizeIp("unknown")).toBeNull();
    });

    it("should parse friendly User-Agent signatures accurately", () => {
      const chromeWin = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
      expect(chromeWin).toBe("Chrome on Windows");

      const safariIos = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
      expect(safariIos).toBe("Safari on iOS");

      const macChrome = parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
      expect(macChrome).toBe("Chrome on macOS");
    });

    it("recordLoginEvent should create LoginEvent and advance lastLoginAt on SUCCESS", async () => {
      const createSpy = vi.spyOn(prisma.loginEvent, "create").mockResolvedValue({} as any);
      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      await recordLoginEvent({
        userId: "user_123",
        status: "SUCCESS",
        ip: "197.210.54.12",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36",
      });

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user_123",
          status: "SUCCESS",
          ipHash: expect.stringMatching(/^hash:/),
          userAgentLabel: "Chrome on Windows",
        }),
      });

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "user_123" },
        data: {
          lastLoginAt: expect.any(Date),
        },
      });
    });

    it("recordLoginEvent should create LoginEvent but NEVER update lastLoginAt on FAILED attempts", async () => {
      const createSpy = vi.spyOn(prisma.loginEvent, "create").mockResolvedValue({} as any);
      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      await recordLoginEvent({
        userId: "user_123",
        status: "FAILED",
        ip: "197.210.54.12",
      });

      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user_123",
          status: "FAILED",
        }),
      });

      // Crucial security requirement: FAILED attempts must NEVER advance lastLoginAt
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("3. 2-Step OTP Login Hook Integration", () => {
    it("verifyAndConsumeLoginOTP should trigger successful login tracking and advance lastLoginAt on valid code", async () => {
      const tokenRecord = {
        id: "tok_test_999",
        userId: "user_test_999",
        tokenHash: hashLoginOTP("123456"),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        user: {
          id: "user_test_999",
          name: "Test User",
          email: "test@bizpilot.ng",
          image: null,
        },
      };

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue(tokenRecord as any);
      vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);
      const loginEventSpy = vi.spyOn(prisma.loginEvent, "create").mockResolvedValue({} as any);
      const userUpdateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      const challengeToken = generateLoginChallengeToken({
        userId: tokenRecord.userId,
        email: tokenRecord.user.email,
        tokenId: tokenRecord.id,
      });

      const result = await verifyAndConsumeLoginOTP(challengeToken, "123456");

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe("user_test_999");
      expect(loginEventSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user_test_999",
          status: "SUCCESS",
        }),
      });
      expect(userUpdateSpy).toHaveBeenCalledWith({
        where: { id: "user_test_999" },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it("verifyAndConsumeLoginOTP should log failed attempt and NOT update user lastLoginAt on wrong code", async () => {
      const tokenRecord = {
        id: "tok_test_888",
        userId: "user_test_888",
        tokenHash: hashLoginOTP("654321"),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        consumedAt: null,
        user: {
          id: "user_test_888",
          name: "Test User",
          email: "test888@bizpilot.ng",
          image: null,
        },
      };

      vi.spyOn(prisma.loginVerificationToken, "findUnique").mockResolvedValue(tokenRecord as any);
      vi.spyOn(prisma.loginVerificationToken, "update").mockResolvedValue({} as any);
      const loginEventSpy = vi.spyOn(prisma.loginEvent, "create").mockResolvedValue({} as any);
      const userUpdateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      const challengeToken = generateLoginChallengeToken({
        userId: tokenRecord.userId,
        email: tokenRecord.user.email,
        tokenId: tokenRecord.id,
      });

      // Pass wrong OTP
      const result = await verifyAndConsumeLoginOTP(challengeToken, "111111");

      expect(result.success).toBe(false);
      expect(loginEventSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user_test_888",
          status: "FAILED",
        }),
      });
      expect(userUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Platform Admin Server Actions & Metrics Aggregation", () => {
    it("getPlatformOverviewStats should aggregate platform counts and revenue correctly", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockPlatformOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockPlatformOwner.id,
        isPlatformAdmin: true,
        email: mockPlatformOwner.email,
      } as any);

      (prisma.user.count as any) = vi.fn().mockImplementation((args?: any) => {
        if (args?.where?.createdAt) return Promise.resolve(5);
        return Promise.resolve(42);
      });

      vi.spyOn(prisma.business, "count").mockResolvedValue(30);

      vi.spyOn(prisma.subscription, "findMany").mockResolvedValue([
        { status: "ACTIVE", plan: { code: "FREE" } },
        { status: "ACTIVE", plan: { code: "STARTER" } },
        { status: "ACTIVE", plan: { code: "PRO" } },
        { status: "ACTIVE", plan: { code: "BUSINESS" } },
      ] as any);

      vi.spyOn(prisma.sale, "aggregate").mockResolvedValue({
        _count: { _all: 150 },
        _sum: { totalAmount: 4500000 as any },
      } as any);

      vi.spyOn(prisma.product, "count").mockResolvedValue(210);

      vi.spyOn(prisma.invoice, "aggregate").mockResolvedValue({
        _count: { _all: 35 },
        _sum: { total: 1200000 as any },
      } as any);

      vi.spyOn(prisma.expense, "aggregate").mockResolvedValue({
        _count: { _all: 18 },
        _sum: { amount: 300000 as any },
      } as any);

      vi.spyOn(prisma.user, "findMany").mockResolvedValue([
        {
          id: "u_recent_1",
          name: "Recent User 1",
          email: "recent1@test.com",
          createdAt: new Date(),
          lastLoginAt: new Date(),
        },
      ] as any);

      vi.spyOn(prisma.loginEvent, "findMany").mockResolvedValue([
        {
          id: "log_1",
          status: "SUCCESS",
          ipHash: "hash:abcdef123456",
          userAgentLabel: "Chrome on Windows",
          createdAt: new Date(),
          user: { id: "u_recent_1", name: "Recent User 1", email: "recent1@test.com" },
        },
      ] as any);

      const stats = await getPlatformOverviewStats();

      expect(stats.totalUsers).toBe(42);
      expect(stats.totalBusinesses).toBe(30);
      expect(stats.planBreakdown.free).toBe(1);
      expect(stats.planBreakdown.starter).toBe(1);
      expect(stats.planBreakdown.pro).toBe(1);
      expect(stats.planBreakdown.business).toBe(1);
      expect(stats.activityTotals.totalSalesCount).toBe(150);
      expect(stats.activityTotals.totalSalesVolume).toBe(4500000);
      expect(stats.recentSuccessfulLogins.length).toBe(1);
    });

    it("getPlatformUsersPaginated should filter and paginate correctly", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockPlatformOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockPlatformOwner.id,
        isPlatformAdmin: true,
        email: mockPlatformOwner.email,
      } as any);

      vi.spyOn(prisma.user, "count").mockResolvedValue(25);
      vi.spyOn(prisma.user, "findMany").mockResolvedValue([
        {
          id: "u_dir_1",
          name: "Directory User",
          email: "dir@test.com",
          isPlatformAdmin: false,
          createdAt: new Date("2026-09-01"),
          lastLoginAt: new Date("2026-09-10"),
          memberships: [
            {
              role: "OWNER",
              business: {
                id: "biz_1",
                name: "Dir Retail Store",
                subscription: { status: "ACTIVE", plan: { code: "PRO" } },
              },
            },
          ],
        },
      ] as any);

      const result = await getPlatformUsersPaginated({
        page: 1,
        limit: 10,
        search: "Directory",
      });

      expect(result.pagination.totalCount).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.users.length).toBe(1);
      expect(result.users[0].businesses[0].name).toBe("Dir Retail Store");
      expect(result.users[0].businesses[0].planCode).toBe("PRO");
    });

    it("togglePlatformAdminAction should prevent admin from removing their own admin status", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockPlatformOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockPlatformOwner.id,
        isPlatformAdmin: true,
        email: mockPlatformOwner.email,
      } as any);

      const result = await togglePlatformAdminAction(mockPlatformOwner.id, false);
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot revoke your own");
    });

    it("togglePlatformAdminAction should successfully promote another user", async () => {
      vi.spyOn(authHelpers, "getCurrentUser").mockResolvedValue(mockPlatformOwner as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: mockPlatformOwner.id,
        isPlatformAdmin: true,
        email: mockPlatformOwner.email,
      } as any);

      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValue({} as any);

      const result = await togglePlatformAdminAction("user_other_999", true);
      expect(result.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "user_other_999" },
        data: { isPlatformAdmin: true },
      });
    });
  });
});
