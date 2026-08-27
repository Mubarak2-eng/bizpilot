import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { hashPassword, verifyPassword } from "../src/lib/password";
import {
  hasMinimumRole,
  hasAllowedRole,
  Role,
  UnauthorizedError,
  ForbiddenError,
} from "../src/types/auth";

describe("Password Security & Hashing", () => {
  it("should hash passwords securely and verify matching passwords", async () => {
    const raw = "SuperSecretPassword123!";
    const hashed = await hashPassword(raw);

    expect(hashed).toBeDefined();
    expect(hashed).not.toBe(raw);
    expect(hashed.startsWith("$2")).toBe(true); // bcrypt signature

    const isValid = await verifyPassword(raw, hashed);
    expect(isValid).toBe(true);
  });

  it("should reject incorrect passwords", async () => {
    const raw = "CorrectPassword123!";
    const hashed = await hashPassword(raw);

    const isWrong = await verifyPassword("WrongPassword456!", hashed);
    expect(isWrong).toBe(false);
  });

  it("should reject short passwords less than 6 characters", async () => {
    await expect(hashPassword("12345")).rejects.toThrow();
  });
});

describe("Role Hierarchy & Permissions Logic", () => {
  it("OWNER should have OWNER, ADMIN, and STAFF permissions", () => {
    expect(hasMinimumRole(Role.OWNER, Role.OWNER)).toBe(true);
    expect(hasMinimumRole(Role.OWNER, Role.ADMIN)).toBe(true);
    expect(hasMinimumRole(Role.OWNER, Role.STAFF)).toBe(true);
    expect(hasMinimumRole(Role.OWNER, Role.MEMBER)).toBe(true);
  });

  it("ADMIN should have ADMIN and STAFF permissions, but NOT OWNER", () => {
    expect(hasMinimumRole(Role.ADMIN, Role.OWNER)).toBe(false);
    expect(hasMinimumRole(Role.ADMIN, Role.ADMIN)).toBe(true);
    expect(hasMinimumRole(Role.ADMIN, Role.STAFF)).toBe(true);
    expect(hasMinimumRole(Role.ADMIN, Role.MEMBER)).toBe(true);
  });

  it("STAFF should only have STAFF permissions, NOT ADMIN or OWNER", () => {
    expect(hasMinimumRole(Role.STAFF, Role.OWNER)).toBe(false);
    expect(hasMinimumRole(Role.STAFF, Role.ADMIN)).toBe(false);
    expect(hasMinimumRole(Role.STAFF, Role.STAFF)).toBe(true);
    expect(hasMinimumRole(Role.STAFF, Role.MEMBER)).toBe(true);
  });

  it("hasAllowedRole should accurately test explicit role inclusion", () => {
    expect(hasAllowedRole(Role.OWNER, [Role.OWNER, Role.ADMIN])).toBe(true);
    expect(hasAllowedRole(Role.ADMIN, [Role.OWNER, Role.ADMIN])).toBe(true);
    expect(hasAllowedRole(Role.STAFF, [Role.OWNER, Role.ADMIN])).toBe(false);
  });
});

describe("Multi-Tenant Database Authorization & Isolation", () => {
  let ownerUser: { id: string; email: string };
  let adminUser: { id: string; email: string };
  let staffUser: { id: string; email: string };
  let primaryBusiness: { id: string; name: string };
  let secondaryBusiness: { id: string; name: string };

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const admin = await prisma.user.findUnique({ where: { email: "admin@bizpilot.test" } });
    const staff = await prisma.user.findUnique({ where: { email: "staff@bizpilot.test" } });

    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!owner || !admin || !staff || !biz1 || !biz2) {
      throw new Error("Seeded test data missing! Run npx prisma db seed first.");
    }

    ownerUser = owner;
    adminUser = admin;
    staffUser = staff;
    primaryBusiness = biz1;
    secondaryBusiness = biz2;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Simulated authorization helper function directly testing DB query logic
  async function checkMembership(userId: string, businessId: string, allowedRoles?: Role[]) {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_businessId: {
          userId,
          businessId,
        },
      },
      include: {
        business: true,
      },
    });

    if (!membership) {
      throw new ForbiddenError("You do not have access to this business");
    }

    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(membership.role)) {
        throw new ForbiddenError(
          `Action requires one of: ${allowedRoles.join(", ")}. User has: ${membership.role}`
        );
      }
    }

    return membership;
  }

  it("1. Unauthenticated user error class should have 401 status", () => {
    const unauthErr = new UnauthorizedError();
    expect(unauthErr.statusCode).toBe(401);
    expect(unauthErr.message).toBe("Authentication required");
  });

  it("2. Authenticated user can access their business", async () => {
    const membership = await checkMembership(ownerUser.id, primaryBusiness.id);
    expect(membership).toBeDefined();
    expect(membership.businessId).toBe(primaryBusiness.id);
    expect(membership.role).toBe(Role.OWNER);
  });

  it("3. User CANNOT access another business where they are not a member (Cross-Tenant Isolation)", async () => {
    // adminUser is only a member of primaryBusiness, NOT secondaryBusiness
    await expect(checkMembership(adminUser.id, secondaryBusiness.id)).rejects.toThrow(
      "You do not have access to this business"
    );

    // staffUser is only a member of primaryBusiness, NOT secondaryBusiness
    await expect(checkMembership(staffUser.id, secondaryBusiness.id)).rejects.toThrow(
      "You do not have access to this business"
    );
  });

  it("4. OWNER has owner permissions", async () => {
    // OWNER should pass OWNER check
    const ownerCheck = await checkMembership(ownerUser.id, primaryBusiness.id, [Role.OWNER]);
    expect(ownerCheck.role).toBe(Role.OWNER);

    // OWNER should pass ADMIN check
    const adminCheck = await checkMembership(ownerUser.id, primaryBusiness.id, [Role.OWNER, Role.ADMIN]);
    expect(adminCheck.role).toBe(Role.OWNER);
  });

  it("5. ADMIN has admin permissions but cannot perform OWNER-only actions", async () => {
    // ADMIN passes ADMIN check
    const adminCheck = await checkMembership(adminUser.id, primaryBusiness.id, [Role.OWNER, Role.ADMIN]);
    expect(adminCheck.role).toBe(Role.ADMIN);

    // ADMIN fails OWNER-only check
    await expect(
      checkMembership(adminUser.id, primaryBusiness.id, [Role.OWNER])
    ).rejects.toThrow("Action requires one of: OWNER. User has: ADMIN");
  });

  it("6. STAFF cannot perform owner-only or admin-only actions", async () => {
    // STAFF fails OWNER-only check
    await expect(
      checkMembership(staffUser.id, primaryBusiness.id, [Role.OWNER])
    ).rejects.toThrow("Action requires one of: OWNER. User has: STAFF");

    // STAFF fails ADMIN-only check
    await expect(
      checkMembership(staffUser.id, primaryBusiness.id, [Role.OWNER, Role.ADMIN])
    ).rejects.toThrow("Action requires one of: OWNER, ADMIN. User has: STAFF");

    // STAFF passes STAFF check
    const staffCheck = await checkMembership(staffUser.id, primaryBusiness.id, [Role.STAFF]);
    expect(staffCheck.role).toBe(Role.STAFF);
  });

  it("7. Client-supplied businessId is never trusted without membership verification", async () => {
    const fakeBusinessId = "non-existent-fake-cuid";
    await expect(checkMembership(ownerUser.id, fakeBusinessId)).rejects.toThrow(
      "You do not have access to this business"
    );
  });

  it("8. Multi-tenant user belongs to multiple businesses", async () => {
    const memberships = await prisma.membership.findMany({
      where: { userId: ownerUser.id },
      include: { business: true },
    });
    expect(memberships.length).toBeGreaterThanOrEqual(2);
    const businessNames = memberships.map((m) => m.business.name);
    expect(businessNames).toContain("Acme Electronics");
    expect(businessNames).toContain("Beta Retailers");
  });

  it("9. Data Isolation: Products and records are strictly scoped to businessId", async () => {
    // Acme Electronics has products seeded
    const acmeProducts = await prisma.product.findMany({
      where: { businessId: primaryBusiness.id },
    });
    expect(acmeProducts.length).toBeGreaterThan(0);

    // Beta Retailers should have 0 products (zero cross-tenant leakage)
    const betaProducts = await prisma.product.findMany({
      where: { businessId: secondaryBusiness.id },
    });
    expect(betaProducts.length).toBe(0);
  });

  it("10. Security: User password is never exposed in public query selects", async () => {
    const safeUser = await prisma.user.findUnique({
      where: { email: "demo@bizpilot.test" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    expect(safeUser).toBeDefined();
    // Verify password property is not present on safe user object
    expect("password" in (safeUser as Record<string, unknown>)).toBe(false);
  });
});

describe("Credentials Verification & Server-Side Login Flow", () => {
  it("should reject verifyUserCredentials with missing fields", async () => {
    const { verifyUserCredentials } = await import("../src/auth");
    const result1 = await verifyUserCredentials("", "Password123!");
    expect(result1).toBeNull();

    const result2 = await verifyUserCredentials("demo@bizpilot.test", "");
    expect(result2).toBeNull();
  });

  it("should reject verifyUserCredentials with non-existent user", async () => {
    const { verifyUserCredentials } = await import("../src/auth");
    const result = await verifyUserCredentials("nonexistent_user_xyz@bizpilot.test", "AnyPassword123!");
    expect(result).toBeNull();
  });

  it("should reject verifyUserCredentials with incorrect password", async () => {
    const { verifyUserCredentials } = await import("../src/auth");
    const result = await verifyUserCredentials("demo@bizpilot.test", "WrongPassword123!");
    expect(result).toBeNull();
  });

  it("should succeed verifyUserCredentials with correct demo credentials", async () => {
    const { verifyUserCredentials } = await import("../src/auth");
    const result = await verifyUserCredentials("demo@bizpilot.test", "DemoPassword123!");
    expect(result).toBeDefined();
    expect(result?.email).toBe("demo@bizpilot.test");
    expect(result?.id).toBeDefined();
    expect("password" in (result as Record<string, unknown>)).toBe(false);
  });

  it("should reject loginAction when missing email or password", async () => {
    const { loginAction } = await import("../src/lib/actions/auth");
    const formData = new FormData();
    const result = await loginAction(undefined, formData);

    expect(result).toBeDefined();
    expect(result?.error).toContain("Please enter your email and password");
  });

  it("should reject credentials callback when CSRF token/cookie is missing (MissingCSRF protection)", async () => {
    const { handlers } = await import("../src/auth");
    const formData = new URLSearchParams();
    formData.append("email", "demo@bizpilot.test");
    formData.append("password", "DemoPassword123!");
    formData.append("callbackUrl", "http://localhost:3000/dashboard");

    const req = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const res = await handlers.POST(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=MissingCSRF");
  });

  it("should successfully authenticate browser login with valid credentials and CSRF handshake", async () => {
    const { handlers } = await import("../src/auth");

    // Step 1: Obtain CSRF token
    const csrfReq = new NextRequest("http://localhost:3000/api/auth/csrf", { method: "GET" });
    const csrfRes = await handlers.GET(csrfReq);
    expect(csrfRes.status).toBe(200);

    const csrfData = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = csrfRes.headers.get("set-cookie") || "";
    expect(csrfData.csrfToken).toBeDefined();
    expect(csrfCookie).toContain("authjs.csrf-token");

    // Step 2: Submit credentials callback with CSRF token & cookie
    const formData = new URLSearchParams();
    formData.append("email", "demo@bizpilot.test");
    formData.append("password", "DemoPassword123!");
    formData.append("csrfToken", csrfData.csrfToken);
    formData.append("callbackUrl", "http://localhost:3000/dashboard");

    const postReq = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookie.split(";")[0],
      },
      body: formData.toString(),
    });

    const postRes = await handlers.POST(postReq);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toBe("http://localhost:3000/dashboard");

    const cookies = postRes.headers.getSetCookie?.() || [];
    const hasSessionCookie = cookies.some((c) => c.includes("authjs.session-token"));
    expect(hasSessionCookie).toBe(true);
  });

  it("should reject browser login with invalid password even with valid CSRF token", async () => {
    const { handlers } = await import("../src/auth");

    // Step 1: Obtain CSRF token
    const csrfReq = new NextRequest("http://localhost:3000/api/auth/csrf", { method: "GET" });
    const csrfRes = await handlers.GET(csrfReq);
    const csrfData = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = csrfRes.headers.get("set-cookie") || "";

    // Step 2: Submit invalid credentials
    const formData = new URLSearchParams();
    formData.append("email", "demo@bizpilot.test");
    formData.append("password", "WrongPassword999!");
    formData.append("csrfToken", csrfData.csrfToken);
    formData.append("callbackUrl", "http://localhost:3000/dashboard");

    const postReq = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookie.split(";")[0],
      },
      body: formData.toString(),
    });

    const postRes = await handlers.POST(postReq);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("error=CredentialsSignin");
  });
});


