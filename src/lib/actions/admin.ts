"use server";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth/admin-guard";
import { PlanCode, Prisma } from "@prisma/client";

export interface PlatformStats {
  totalUsers: number;
  totalBusinesses: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  planBreakdown: {
    free: number;
    starter: number;
    pro: number;
    business: number;
  };
  activityTotals: {
    totalSalesCount: number;
    totalSalesVolume: number;
    totalProductsCount: number;
    totalInvoicesCount: number;
    totalInvoicesVolume: number;
    totalExpensesCount: number;
    totalExpensesVolume: number;
  };
  recentRegistrations: Array<{
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    lastLoginAt: string | null;
  }>;
  recentSuccessfulLogins: Array<{
    id: string;
    userName: string | null;
    userEmail: string;
    ipHash: string | null;
    userAgentLabel: string | null;
    createdAt: string;
  }>;
}

export interface PlatformUserItem {
  id: string;
  name: string | null;
  email: string;
  isPlatformAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  businesses: Array<{
    id: string;
    name: string;
    role: string;
    planCode: string;
    subscriptionStatus: string;
  }>;
}

export interface PaginatedUsersResult {
  users: PlatformUserItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

/**
 * Server Action to fetch platform-wide overview metrics.
 * Strictly guarded: Non-platform admins will receive a 403 Forbidden error.
 */
export async function getPlatformOverviewStats(): Promise<PlatformStats> {
  await requirePlatformAdmin();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Parallel aggregate queries for high performance
  const [
    totalUsers,
    totalBusinesses,
    newUsersLast7Days,
    newUsersLast30Days,
    subscriptions,
    totalSalesAgg,
    totalProductsCount,
    totalInvoicesAgg,
    totalExpensesAgg,
    recentUsers,
    recentLogins,
  ] = await Promise.all([
    // User counts
    prisma.user.count(),
    prisma.business.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),

    // Subscriptions breakdown
    prisma.subscription.findMany({
      select: {
        status: true,
        plan: { select: { code: true } },
      },
    }),

    // Platform Activity: Sales
    prisma.sale.aggregate({
      where: { status: "COMPLETED" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),

    // Platform Activity: Products
    prisma.product.count(),

    // Platform Activity: Invoices
    prisma.invoice.aggregate({
      _count: { _all: true },
      _sum: { total: true },
    }),

    // Platform Activity: Expenses
    prisma.expense.aggregate({
      _count: { _all: true },
      _sum: { amount: true },
    }),

    // Recent registrations
    prisma.user.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),

    // Recent successful logins
    prisma.loginEvent.findMany({
      take: 6,
      where: { status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  // Aggregate plan distribution
  const planBreakdown = {
    free: 0,
    starter: 0,
    pro: 0,
    business: 0,
  };

  subscriptions.forEach((sub) => {
    const code = sub.plan.code;
    if (code === PlanCode.FREE) planBreakdown.free += 1;
    else if (code === PlanCode.STARTER) planBreakdown.starter += 1;
    else if (code === PlanCode.PRO) planBreakdown.pro += 1;
    else if (code === PlanCode.BUSINESS) planBreakdown.business += 1;
  });

  return {
    totalUsers,
    totalBusinesses,
    newUsersLast7Days,
    newUsersLast30Days,
    planBreakdown,
    activityTotals: {
      totalSalesCount: totalSalesAgg._count?._all || 0,
      totalSalesVolume: Number(totalSalesAgg._sum?.totalAmount || 0),
      totalProductsCount,
      totalInvoicesCount: totalInvoicesAgg._count?._all || 0,
      totalInvoicesVolume: Number(totalInvoicesAgg._sum?.total || 0),
      totalExpensesCount: totalExpensesAgg._count?._all || 0,
      totalExpensesVolume: Number(totalExpensesAgg._sum?.amount || 0),
    },
    recentRegistrations: recentUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    })),
    recentSuccessfulLogins: recentLogins.map((ev) => ({
      id: ev.id,
      userName: ev.user?.name || null,
      userEmail: ev.user?.email || "Unknown",
      ipHash: ev.ipHash,
      userAgentLabel: ev.userAgentLabel,
      createdAt: ev.createdAt.toISOString(),
    })),
  };
}

/**
 * Server Action to fetch paginated and searchable users directory.
 * Strictly guarded: Non-platform admins will receive a 403 Forbidden error.
 */
export async function getPlatformUsersPaginated(params?: {
  page?: number;
  limit?: number;
  search?: string;
  filter?: "all" | "admin" | "active_login";
}): Promise<PaginatedUsersResult> {
  await requirePlatformAdmin();

  const page = Math.max(1, Number(params?.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(params?.limit) || 10));
  const skip = (page - 1) * limit;
  const search = params?.search?.trim();
  const filter = params?.filter || "all";

  // Build prisma filter conditions
  const where: Prisma.UserWhereInput = {};

  if (filter === "admin") {
    where.isPlatformAdmin = true;
  } else if (filter === "active_login") {
    where.lastLoginAt = { not: null };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      {
        memberships: {
          some: {
            business: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  const [totalCount, dbUsers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        isPlatformAdmin: true,
        createdAt: true,
        lastLoginAt: true,
        memberships: {
          include: {
            business: {
              select: {
                id: true,
                name: true,
                subscription: {
                  select: {
                    status: true,
                    plan: { select: { code: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const users: PlatformUserItem[] = dbUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isPlatformAdmin: u.isPlatformAdmin,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    businesses: u.memberships.map((m) => ({
      id: m.business.id,
      name: m.business.name,
      role: m.role,
      planCode: m.business.subscription?.plan?.code || "FREE",
      subscriptionStatus: m.business.subscription?.status || "ACTIVE",
    })),
  }));

  return {
    users,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * Server Action to toggle platform admin status for a user.
 * Strictly guarded: Can only be called by an existing platform admin.
 */
export async function togglePlatformAdminAction(
  targetUserId: string,
  makeAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
  const { user } = await requirePlatformAdmin();

  if (!targetUserId) {
    return { success: false, error: "User ID is required." };
  }

  // Prevent self-demotion to avoid locking out the last admin
  if (user.id === targetUserId && !makeAdmin) {
    return { success: false, error: "You cannot revoke your own Platform Admin access." };
  }

  try {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { isPlatformAdmin: makeAdmin },
    });
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update admin role.";
    return { success: false, error: errorMessage };
  }
}
