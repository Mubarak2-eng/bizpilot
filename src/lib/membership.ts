import { prisma } from "./prisma";
import {
  ActiveBusinessContext,
  ForbiddenError,
  hasAllowedRole,
  Role,
} from "../types/auth";

/**
 * Pure database membership verification function.
 * Validates that userId belongs to businessId in Prisma and satisfies optional role constraints.
 * Safe for both server runtime and testing environments.
 */
export async function verifyBusinessMembership(
  businessId: string,
  userId: string,
  allowedRoles?: Role[]
): Promise<ActiveBusinessContext> {
  if (!businessId || !userId) {
    throw new ForbiddenError("Valid businessId and userId are required");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_businessId: {
        userId,
        businessId,
      },
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!membership) {
    throw new ForbiddenError("You do not have access to this business");
  }

  if (allowedRoles && allowedRoles.length > 0) {
    if (!hasAllowedRole(membership.role, allowedRoles)) {
      throw new ForbiddenError(
        `Action requires one of the following roles: ${allowedRoles.join(", ")}`
      );
    }
  }

  return {
    user: membership.user,
    business: membership.business,
    membership: {
      id: membership.id,
      role: membership.role,
      createdAt: membership.createdAt,
    },
    role: membership.role,
  };
}
