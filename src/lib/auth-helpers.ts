import { cookies } from "next/headers";
import { auth } from "../auth";
import { prisma } from "./prisma";
import {
  ActiveBusinessContext,
  BusinessSummary,
  ForbiddenError,
  hasMinimumRole,
  Role,
  SessionUser,
  UnauthorizedError,
} from "../types/auth";

export const ACTIVE_BUSINESS_COOKIE = "bizpilot_active_business";

/**
 * Returns the currently authenticated user from the session,
 * verified against the database. Returns null if unauthenticated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  const userId = session.user.id;
  const email = session.user.email;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(userId ? [{ id: userId }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isPlatformAdmin: true,
      lastLoginAt: true,
    },
  });

  return user;
}

/**
 * Throws UnauthorizedError if user is not authenticated.
 * Returns the authenticated user.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("Authentication required to access this resource");
  }
  return user;
}

/**
 * Retrieves all business memberships for a given user ID.
 */
export async function getUserMemberships(
  userId: string
): Promise<BusinessSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.business.id,
    name: m.business.name,
    slug: m.business.slug,
    currency: m.business.currency,
    role: m.role,
  }));
}

/**
 * Safely resolves the active business for the authenticated user.
 *
 * Security Guarantee:
 * - Checks authenticated user session
 * - Resolves active business ID from optional param, cookie, or first available business
 * - ALWAYS validates that the user is an active member in the database
 * - If client provides an invalid or unauthorized businessId, automatically falls back
 *   to a valid membership to prevent cross-tenant access.
 */
export async function getActiveBusiness(
  requestedBusinessId?: string
): Promise<ActiveBusinessContext | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  // 1. Determine candidate businessId
  let candidateId = requestedBusinessId;
  if (!candidateId) {
    try {
      const cookieStore = await cookies();
      candidateId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
    } catch {
      // In non-request environments (e.g. some test runners), cookies() might not be available
      candidateId = undefined;
    }
  }

  // 2. Fetch user memberships with business details
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    return null;
  }

  // 3. Find matching membership if candidateId provided, else default to first
  let selectedMembership = candidateId
    ? memberships.find((m) => m.businessId === candidateId)
    : undefined;

  // Fallback to first membership if candidate was invalid/unauthorized
  if (!selectedMembership) {
    selectedMembership = memberships[0];
  }

  return {
    user,
    business: selectedMembership.business,
    membership: {
      id: selectedMembership.id,
      role: selectedMembership.role,
      createdAt: selectedMembership.createdAt,
    },
    role: selectedMembership.role,
  };
}

import { verifyBusinessMembership } from "./membership";
export { verifyBusinessMembership };

/**
 * Enforces that the authenticated user belongs to the specified business.
 * Throws UnauthorizedError (401) if not logged in.
 * Throws ForbiddenError (403) if not a member or if role is not in allowedRoles.
 *
 * Security: NEVER trusts client-supplied businessId without DB membership verification.
 */
export async function requireBusinessMembership(
  businessId: string,
  allowedRoles?: Role[]
): Promise<ActiveBusinessContext> {
  if (!businessId) {
    throw new ForbiddenError("A valid businessId is required");
  }

  const user = await requireAuth();
  return verifyBusinessMembership(businessId, user.id, allowedRoles);
}

/**
 * Enforces that the user has at least the specified minimum role in the hierarchy.
 * e.g., requireBusinessRole(bizId, Role.ADMIN) allows OWNER and ADMIN, but rejects STAFF.
 */
export async function requireBusinessRole(
  businessId: string,
  minimumRole: Role
): Promise<ActiveBusinessContext> {
  const context = await requireBusinessMembership(businessId);

  if (!hasMinimumRole(context.role, minimumRole)) {
    throw new ForbiddenError(
      `Action requires at least ${minimumRole} role. Your role: ${context.role}`
    );
  }

  return context;
}
