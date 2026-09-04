import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { createSaleAction } from "../src/lib/actions/sales";
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "../src/lib/actions/notifications";
import { Role } from "../src/types/auth";

// Mock next/cache revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockUserId = "";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(async () => {
    const user = await prisma.user.findUnique({ where: { id: mockUserId } });
    if (!user) throw new Error("Unauthorized");
    return user;
  }),
  requireBusinessMembership: vi.fn(async (businessId: string) => {
    const user = await prisma.user.findUnique({ where: { id: mockUserId } });
    if (!user) throw new Error("Unauthorized");

    const membership = await prisma.membership.findUnique({
      where: {
        userId_businessId: {
          userId: user.id,
          businessId,
        },
      },
      include: { business: true },
    });

    if (!membership) {
      throw new Error("Access denied: You are not a member of this business.");
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      business: membership.business,
      role: membership.role as Role,
      membership,
    };
  }),
}));

describe("Phase 9: Real-Time Low-Stock Alerts & Notification Engine", () => {
  let primaryBusiness: { id: string; name: string; currency: string };
  let secondaryBusiness: { id: string; name: string; currency: string };
  let ownerUser: { id: string; email: string };
  let testCustomer: { id: string; name: string };

  let productA: { id: string; name: string; sku: string }; // Stock: 15, Threshold: 10
  let productB: { id: string; name: string; sku: string }; // Stock: 8, Threshold: 10 (already below)
  let productC: { id: string; name: string; sku: string }; // Stock: 12, Threshold: 10

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!owner || !biz1 || !biz2) {
      throw new Error("Seeded test data missing! Run seed first.");
    }

    ownerUser = owner;
    mockUserId = owner.id;
    primaryBusiness = biz1;
    secondaryBusiness = biz2;

    const cust = await prisma.customer.findFirst({ where: { businessId: primaryBusiness.id } });
    if (!cust) throw new Error("Customer missing");
    testCustomer = cust;

    // Create test products with explicit stock quantities and thresholds
    const pA = await prisma.product.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Alert Test Prod A-${Date.now()}`,
        sku: `ALT-A-${Date.now()}`,
        sellingPrice: "5000.00",
        costPrice: "3000.00",
        stockQuantity: 15,
        lowStockThreshold: 10,
      },
    });
    productA = { id: pA.id, name: pA.name, sku: pA.sku };

    const pB = await prisma.product.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Alert Test Prod B-${Date.now()}`,
        sku: `ALT-B-${Date.now()}`,
        sellingPrice: "4000.00",
        costPrice: "2000.00",
        stockQuantity: 8,
        lowStockThreshold: 10,
      },
    });
    productB = { id: pB.id, name: pB.name, sku: pB.sku };

    const pC = await prisma.product.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Alert Test Prod C-${Date.now()}`,
        sku: `ALT-C-${Date.now()}`,
        sellingPrice: "6000.00",
        costPrice: "3500.00",
        stockQuantity: 12,
        lowStockThreshold: 10,
      },
    });
    productC = { id: pC.id, name: pC.name, sku: pC.sku };
  });

  afterAll(async () => {
    try {
      // Cleanup created products, sales, and notifications
      const productIds = [productA?.id, productB?.id, productC?.id].filter(Boolean);
      await prisma.notification.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.saleItem.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: productIds } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe("1. Stock Crossing Threshold Semantics", () => {
    it("should NOT create alert when sale leaves stock at or above threshold", async () => {
      // Product A: Stock 15 -> Customer buys 2 -> Stock becomes 13 (>= 10)
      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        customerId: testCustomer.id,
        items: [{ productId: productA.id, quantity: 2 }],
      });

      expect(res.success).toBe(true);

      const notif = await prisma.notification.findFirst({
        where: { businessId: primaryBusiness.id, productId: productA.id },
      });

      expect(notif).toBeNull();
    });

    it("should create exactly ONE alert when stock crosses from above/equal threshold to below threshold", async () => {
      // Product A: Stock 13 -> Customer buys 5 -> Stock becomes 8 (< 10)
      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        customerId: testCustomer.id,
        items: [{ productId: productA.id, quantity: 5 }],
      });

      expect(res.success).toBe(true);

      const notifs = await prisma.notification.findMany({
        where: { businessId: primaryBusiness.id, productId: productA.id },
      });

      expect(notifs.length).toBe(1);
      expect(notifs[0].type).toBe("LOW_STOCK");
      expect(notifs[0].title).toContain(productA.name);
      expect(notifs[0].message).toContain("8 unit");
      expect(notifs[0].read).toBe(false);
    });

    it("should NOT create another alert if stock was already below threshold before the sale", async () => {
      // Product B: Stock 8 (already < 10) -> Customer buys 2 -> Stock becomes 6
      const countBefore = await prisma.notification.count({
        where: { businessId: primaryBusiness.id, productId: productB.id },
      });

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        customerId: testCustomer.id,
        items: [{ productId: productB.id, quantity: 2 }],
      });

      expect(res.success).toBe(true);

      const countAfter = await prisma.notification.count({
        where: { businessId: primaryBusiness.id, productId: productB.id },
      });

      expect(countAfter).toBe(countBefore); // No new alert created!
    });

    it("should create separate alerts when multiple products in one sale cross below threshold", async () => {
      // Create fresh products D and E
      const pD = await prisma.product.create({
        data: {
          businessId: primaryBusiness.id,
          name: `Multi Alert D-${Date.now()}`,
          sku: `ALT-D-${Date.now()}`,
          sellingPrice: "3000.00",
          costPrice: "1500.00",
          stockQuantity: 11,
          lowStockThreshold: 10,
        },
      });

      const pE = await prisma.product.create({
        data: {
          businessId: primaryBusiness.id,
          name: `Multi Alert E-${Date.now()}`,
          sku: `ALT-E-${Date.now()}`,
          sellingPrice: "3000.00",
          costPrice: "1500.00",
          stockQuantity: 10,
          lowStockThreshold: 10,
        },
      });

      // Sale buys 2 units of D (11 -> 9) and 1 unit of E (10 -> 9)
      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        customerId: testCustomer.id,
        items: [
          { productId: pD.id, quantity: 2 },
          { productId: pE.id, quantity: 1 },
        ],
      });

      expect(res.success).toBe(true);

      const notifD = await prisma.notification.findFirst({
        where: { businessId: primaryBusiness.id, productId: pD.id },
      });
      const notifE = await prisma.notification.findFirst({
        where: { businessId: primaryBusiness.id, productId: pE.id },
      });

      expect(notifD).toBeDefined();
      expect(notifE).toBeDefined();
      expect(notifD?.title).toContain(pD.name);
      expect(notifE?.title).toContain(pE.name);

      // Cleanup D & E
      await prisma.notification.deleteMany({ where: { productId: { in: [pD.id, pE.id] } } });
      await prisma.saleItem.deleteMany({ where: { productId: { in: [pD.id, pE.id] } } });
      await prisma.product.deleteMany({ where: { id: { in: [pD.id, pE.id] } } });
    });

    it("should NOT create a notification if the sale fails and rolls back", async () => {
      // Attempt sale with quantity greater than available stock
      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        customerId: testCustomer.id,
        items: [{ productId: productC.id, quantity: 999 }],
      });

      expect(res.error).toMatch(/insufficient stock/i);

      const notif = await prisma.notification.findFirst({
        where: { businessId: primaryBusiness.id, productId: productC.id },
      });

      expect(notif).toBeNull();
    });
  });

  describe("2. Notification Actions, Mark As Read & Multi-Tenant Isolation", () => {
    let testNotificationId = "";

    beforeAll(async () => {
      const notif = await prisma.notification.findFirst({
        where: { businessId: primaryBusiness.id },
      });
      if (notif) {
        testNotificationId = notif.id;
      }
    });

    it("getNotificationsAction should return unread count and list scoped to tenant", async () => {
      const res = await getNotificationsAction(primaryBusiness.id);
      expect(res.success).toBe(true);
      expect(res.unreadCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.notifications)).toBe(true);
      expect(res.notifications.length).toBeGreaterThanOrEqual(1);
    });

    it("markNotificationReadAction should mark specific notification as read", async () => {
      if (!testNotificationId) return;

      const res = await markNotificationReadAction(primaryBusiness.id, testNotificationId);
      expect(res.success).toBe(true);

      const updated = await prisma.notification.findUnique({ where: { id: testNotificationId } });
      expect(updated?.read).toBe(true);
    });

    it("markAllNotificationsReadAction should mark all unread notifications as read", async () => {
      const res = await markAllNotificationsReadAction(primaryBusiness.id);
      expect(res.success).toBe(true);

      const remainingUnread = await prisma.notification.count({
        where: { businessId: primaryBusiness.id, read: false },
      });
      expect(remainingUnread).toBe(0);
    });

    it("should reject cross-tenant notification access and manipulation", async () => {
      if (!testNotificationId) return;

      // Attempt to mark primary business's notification from secondary business context
      const res = await markNotificationReadAction(secondaryBusiness.id, testNotificationId);
      expect(res.error).toMatch(/not found or access denied/i);
    });
  });
});
