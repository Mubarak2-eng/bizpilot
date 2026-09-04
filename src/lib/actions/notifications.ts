"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusinessMembership } from "@/lib/auth-helpers";
import { NotificationType } from "@prisma/client";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  productId: string | null;
  productName?: string | null;
  currentStock?: number | null;
  lowStockThreshold?: number | null;
  createdAt: string;
}

export interface NotificationsResult {
  success?: boolean;
  error?: string;
  unreadCount: number;
  notifications: NotificationItem[];
}

/**
 * Retrieves the recent notifications and unread alert count for the active business.
 * Strictly scoped to the authenticated user's active tenant.
 */
export async function getNotificationsAction(
  businessId: string,
  limit = 20
): Promise<NotificationsResult> {
  try {
    const context = await requireBusinessMembership(businessId);

    const [unreadCount, records] = await Promise.all([
      prisma.notification.count({
        where: {
          businessId: context.business.id,
          read: false,
        },
      }),
      prisma.notification.findMany({
        where: {
          businessId: context.business.id,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              stockQuantity: true,
              lowStockThreshold: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
      }),
    ]);

    const formatted: NotificationItem[] = records.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      productId: n.productId,
      productName: n.product?.name || null,
      currentStock: n.product?.stockQuantity ?? null,
      lowStockThreshold: n.product?.lowStockThreshold ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return {
      success: true,
      unreadCount,
      notifications: formatted,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load notifications.";
    return {
      error: message,
      unreadCount: 0,
      notifications: [],
    };
  }
}

/**
 * Marks a specific notification as read.
 * Enforces tenant ownership verification.
 */
export async function markNotificationReadAction(
  businessId: string,
  notificationId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const context = await requireBusinessMembership(businessId);

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        businessId: context.business.id,
      },
    });

    if (!notification) {
      return { error: "Notification not found or access denied." };
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/sales");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark notification as read.";
    return { error: message };
  }
}

/**
 * Marks all unread notifications for the active business as read.
 */
export async function markAllNotificationsReadAction(
  businessId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const context = await requireBusinessMembership(businessId);

    await prisma.notification.updateMany({
      where: {
        businessId: context.business.id,
        read: false,
      },
      data: {
        read: true,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath("/sales");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark all notifications as read.";
    return { error: message };
  }
}
