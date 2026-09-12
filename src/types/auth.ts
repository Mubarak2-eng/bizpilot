import { Role } from "@prisma/client";

export { Role };

/**
 * Role hierarchy weight (higher number = higher privilege).
 * OWNER (3) > ADMIN (2) > STAFF (1) = MEMBER (1)
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  OWNER: 3,
  ADMIN: 2,
  STAFF: 1,
  MEMBER: 1,
};

/**
 * Checks if a given user role meets the minimum required role.
 * e.g., an OWNER meets the ADMIN and STAFF requirements.
 */
export function hasMinimumRole(userRole: Role, minimumRole: Role): boolean {
  const userWeight = ROLE_HIERARCHY[userRole] ?? 0;
  const minWeight = ROLE_HIERARCHY[minimumRole] ?? 0;
  return userWeight >= minWeight;
}

/**
 * Checks if a user's role is in the list of explicitly allowed roles.
 */
export function hasAllowedRole(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  isPlatformAdmin?: boolean;
  lastLoginAt?: Date | null;
}

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  currency: string;
  role: Role;
}

export interface ActiveBusinessContext {
  user: SessionUser;
  business: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  membership: {
    id: string;
    role: Role;
    createdAt: Date;
  };
  role: Role;
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message = "Access denied: insufficient permissions or not a member") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
