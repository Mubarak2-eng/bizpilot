import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ForbiddenError, UnauthorizedError, SessionUser } from "@/types/auth";

/**
 * Returns list of configured platform admin emails from environment.
 */
export function getPlatformAdminEmails(): string[] {
  const envEmails = process.env.PLATFORM_ADMIN_EMAILS || "";
  return envEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => Boolean(e));
}

/**
 * Verifies if a user object meets platform admin authorization criteria.
 */
export function isPlatformAdminUser(user?: { isPlatformAdmin?: boolean | null; email?: string | null } | null): boolean {
  if (!user || !user.email) return false;
  
  // 1. Explicit database platform-admin flag
  if (user.isPlatformAdmin === true) return true;

  // 2. Verified platform admin email in environment config
  const adminEmails = getPlatformAdminEmails();
  if (adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase().trim())) {
    return true;
  }

  return false;
}

export interface PlatformAdminContext {
  user: SessionUser & { isPlatformAdmin: boolean };
}

/**
 * Strictly enforces server-side Platform Admin authorization.
 * Throws UnauthorizedError (401) if not logged in.
 * Throws ForbiddenError (403) if the user is not a verified platform admin.
 *
 * Security Guarantee:
 * - Never trusts client headers or tenant roles (OWNER/ADMIN within a single business do NOT grant platform admin access).
 * - Always validates user from the database.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser || !sessionUser.id) {
    throw new UnauthorizedError("Authentication required to access the Platform Admin Dashboard.");
  }

  // Fetch fresh platform admin flag directly from database
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isPlatformAdmin: true,
    },
  });

  if (!dbUser) {
    throw new UnauthorizedError("User account not found.");
  }

  const isAdmin = isPlatformAdminUser(dbUser);

  if (!isAdmin) {
    throw new ForbiddenError("Access denied: Platform Admin privileges are required to view this page.");
  }

  return {
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      image: dbUser.image,
      isPlatformAdmin: true,
    },
  };
}
