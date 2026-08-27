import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { AuthenticatedAIContext } from "../src/lib/ai/types";
import {
  draft_invoice,
  prepare_expense,
  prepare_sale,
  resolveCustomerCandidate,
} from "../src/lib/ai/action-tools";
import { parseInvoiceIntent } from "../src/lib/ai/provider";
import {
  createPendingAction,
  getAndConsumePendingAction,
  cancelPendingAction,
} from "../src/lib/ai/pending-actions";
import { runAIAssistant } from "../src/lib/ai/executor";
import { Role } from "../src/types/auth";
import { toDecimalString } from "../src/lib/money";

describe("Phase 4B: Controlled AI Business Actions", () => {
  let primaryContext: AuthenticatedAIContext;
  let secondaryContext: AuthenticatedAIContext;
  let sampleCustomer: { id: string; name: string };
  let sampleProduct: { id: string; name: string; sku: string; stockQuantity: number; sellingPrice: string };

  beforeAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!user || !biz1 || !biz2) {
      throw new Error("Seeded test data missing for Phase 4B tests!");
    }

    primaryContext = {
      userId: user.id,
      businessId: biz1.id,
      businessName: biz1.name,
      currency: biz1.currency,
      role: Role.OWNER,
    };

    secondaryContext = {
      userId: user.id,
      businessId: biz2.id,
      businessName: biz2.name,
      currency: biz2.currency,
      role: Role.OWNER,
    };

    const cust = await prisma.customer.findFirst({ where: { businessId: biz1.id } });
    if (!cust) throw new Error("Customer missing for Acme Electronics!");
    sampleCustomer = { id: cust.id, name: cust.name };

    const prod = await prisma.product.findFirst({ where: { businessId: biz1.id } });
    if (!prod) throw new Error("Product missing for Acme Electronics!");
    sampleProduct = {
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      stockQuantity: prod.stockQuantity,
      sellingPrice: prod.sellingPrice.toString(),
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Action 1: Draft Invoice & Confirmation Security", () => {
    it("should draft an invoice from natural language parameters using DB prices", async () => {
      const draft = await draft_invoice(
        {
          customerName: sampleCustomer.name,
          items: [{ productName: sampleProduct.name, quantity: 2 }],
          taxPercent: 7.5,
        },
        primaryContext
      );

      expect(draft.isActionPreview).toBe(true);
      expect(draft.actionType).toBe("CREATE_INVOICE");
      expect(draft.token).toBeDefined();
      expect(draft.preview.customer.id).toBe(sampleCustomer.id);
      expect(draft.preview.items[0].unitPrice).toMatch(/[₦$£€]/);
    });

    it("should reject customer resolution if customer does NOT belong to active business", async () => {
      // In secondaryContext (Beta Retailers), sampleCustomer does not exist
      await expect(
        draft_invoice(
          {
            customerName: sampleCustomer.name,
            items: [{ productName: "Widget", quantity: 1 }],
          },
          secondaryContext
        )
      ).rejects.toThrow("was not found in your business directory");
    });

    it("should reject invoice draft if product is not in active business catalog", async () => {
      await expect(
        draft_invoice(
          {
            customerName: sampleCustomer.name,
            items: [{ productName: "NonExistentProductXYZ-999", quantity: 1 }],
          },
          primaryContext
        )
      ).rejects.toThrow("was not found in your catalog");
    });
  });

  describe("2. Action 2: Record Expense Preparation", () => {
    it("should prepare validated expense preview", async () => {
      const res = await prepare_expense(
        {
          category: "Maintenance",
          amount: 5000,
          description: "Generator fuel for test",
        },
        primaryContext
      );

      expect(res.isActionPreview).toBe(true);
      expect(res.actionType).toBe("CREATE_EXPENSE");
      expect(res.token).toBeDefined();
      expect(res.preview.amount).toContain("5,000");
    });

    it("should reject invalid, zero, or negative expense amounts", async () => {
      await expect(
        prepare_expense(
          {
            category: "Utilities",
            amount: 0,
          },
          primaryContext
        )
      ).rejects.toThrow("positive number");

      await expect(
        prepare_expense(
          {
            category: "Utilities",
            amount: -500,
          },
          primaryContext
        )
      ).rejects.toThrow("positive number");
    });
  });

  describe("3. Action 3: Record Sale (POS) Preparation & Stock Validation", () => {
    it("should prepare sale using DB prices and verify available stock", async () => {
      const salePreview = await prepare_sale(
        {
          customerName: sampleCustomer.name,
          items: [{ productName: sampleProduct.name, quantity: 1 }],
          paymentMethod: "CASH",
        },
        primaryContext
      );

      expect(salePreview.isActionPreview).toBe(true);
      expect(salePreview.actionType).toBe("CREATE_SALE");
      expect(salePreview.token).toBeDefined();
      expect(salePreview.preview.items.length).toBe(1);
    });

    it("should reject sale preview if requested quantity exceeds available stock", async () => {
      // Create a temporary product with stock = 2
      const limitedProduct = await prisma.product.create({
        data: {
          businessId: primaryContext.businessId,
          name: `Limited Stock Item ${Date.now()}`,
          sku: `LIM-${Date.now()}`,
          sellingPrice: "2000.00",
          costPrice: "1000.00",
          stockQuantity: 2,
        },
      });

      await expect(
        prepare_sale(
          {
            items: [{ productId: limitedProduct.id, quantity: 10 }],
          },
          primaryContext
        )
      ).rejects.toThrow("Insufficient stock");

      // Cleanup
      await prisma.product.delete({ where: { id: limitedProduct.id } });
    });
  });

  describe("4. Pending Action Security: Anti-Replay, Expiration & Tenant Isolation", () => {
    it("should prevent replaying a confirmed action token (single-use enforcement)", () => {
      const token = createPendingAction(
        primaryContext.userId,
        primaryContext.businessId,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 1200, description: "Test", date: "2026-08-21" },
        }
      );

      // First consumption: success
      const record = getAndConsumePendingAction(token, primaryContext.userId, primaryContext.businessId);
      expect(record.used).toBe(true);

      // Second consumption: MUST throw replay attack error
      expect(() =>
        getAndConsumePendingAction(token, primaryContext.userId, primaryContext.businessId)
      ).toThrow("already been confirmed");
    });

    it("should reject expired pending action tokens", () => {
      // Create an action with 1ms TTL
      const expiredToken = createPendingAction(
        primaryContext.userId,
        primaryContext.businessId,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 500, description: "Expired", date: "2026-08-21" },
        },
        -1000 // already expired
      );

      expect(() =>
        getAndConsumePendingAction(expiredToken, primaryContext.userId, primaryContext.businessId)
      ).toThrow("expired");
    });

    it("should reject action token if executed by a different user or different business", () => {
      const token = createPendingAction(
        primaryContext.userId,
        primaryContext.businessId,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 800, description: "Tenant check", date: "2026-08-21" },
        }
      );

      // Attempting to consume under secondary business MUST throw
      expect(() =>
        getAndConsumePendingAction(token, primaryContext.userId, secondaryContext.businessId)
      ).toThrow("Security violation");

      // Attempting to consume with a different userId MUST throw
      expect(() =>
        getAndConsumePendingAction(token, "other-attacker-user", primaryContext.businessId)
      ).toThrow("Security violation");
    });

    it("should support voluntary action cancellation", () => {
      const token = createPendingAction(
        primaryContext.userId,
        primaryContext.businessId,
        "CREATE_EXPENSE",
        {
          type: "CREATE_EXPENSE",
          data: { category: "Supplies", amount: 300, description: "Cancel me", date: "2026-08-21" },
        }
      );

      const cancelled = cancelPendingAction(token, primaryContext.userId, primaryContext.businessId);
      expect(cancelled).toBe(true);

      // After cancellation, token cannot be consumed
      expect(() =>
        getAndConsumePendingAction(token, primaryContext.userId, primaryContext.businessId)
      ).toThrow("not found");
    });
  });

  describe("5. End-to-End Action Execution & Stock Re-check", () => {
    it("should execute confirmed invoice creation and create exactly one DB record", async () => {
      const draft = await draft_invoice(
        {
          customerName: sampleCustomer.name,
          items: [{ productName: sampleProduct.name, quantity: 1 }],
          taxPercent: 7.5,
        },
        primaryContext
      );

      // Consume token
      const record = getAndConsumePendingAction(draft.token, primaryContext.userId, primaryContext.businessId);
      expect(record.actionType).toBe("CREATE_INVOICE");

      const invData = record.payload.data as { customerId: string; dueDate: string; taxPercent: number; subtotal: number; taxAmount: number; total: number; items: { productId?: string; productName: string; quantity: number; unitPrice: number; totalAmount: number }[] };

      // Create in DB
      const invoiceNumber = `AI-INV-${Date.now()}`;
      const created = await prisma.invoice.create({
        data: {
          businessId: primaryContext.businessId,
          customerId: invData.customerId,
          invoiceNumber,
          status: "SENT",
          subtotal: toDecimalString(invData.subtotal),
          tax: toDecimalString(invData.taxAmount),
          total: toDecimalString(invData.total),
          dueDate: new Date(invData.dueDate),
          items: {
            create: invData.items.map((i) => ({
              productId: i.productId,
              description: i.productName,
              quantity: i.quantity,
              unitPrice: toDecimalString(i.unitPrice),
              totalAmount: toDecimalString(i.totalAmount),
            })),
          },
        },
      });

      expect(created.id).toBeDefined();

      // Clean up
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: created.id } });
      await prisma.invoice.delete({ where: { id: created.id } });
    });

    it("should execute confirmed sale, verify stock inside transaction, and decrement inventory", async () => {
      const tempProduct = await prisma.product.create({
        data: {
          businessId: primaryContext.businessId,
          name: `AI Sale Test Product ${Date.now()}`,
          sku: `AIS-${Date.now()}`,
          sellingPrice: "4000.00",
          costPrice: "2000.00",
          stockQuantity: 10,
        },
      });

      const qtyToBuy = 2;

      // Prepare sale preview
      const preview = await prepare_sale(
        {
          items: [{ productId: tempProduct.id, quantity: qtyToBuy }],
          paymentMethod: "CASH",
        },
        primaryContext
      );

      // Consume token
      const record = getAndConsumePendingAction(preview.token, primaryContext.userId, primaryContext.businessId);
      const saleData = record.payload.data as { customerId?: string; items: { productId: string; quantity: number; unitPrice: number; totalAmount: number }[]; totalAmount: number; paymentMethod: "CASH" | "CARD" | "TRANSFER" | "MOBILE_MONEY" };

      // Execute transactional database write
      const sale = await prisma.$transaction(async (tx) => {
        // Re-check live stock
        const liveProd = await tx.product.findUnique({ where: { id: tempProduct.id } });
        if (!liveProd || liveProd.stockQuantity < qtyToBuy) {
          throw new Error("Insufficient stock at confirmation time");
        }

        // Decrement stock
        await tx.product.update({
          where: { id: tempProduct.id },
          data: { stockQuantity: { decrement: qtyToBuy } },
        });

        // Create sale
        return tx.sale.create({
          data: {
            businessId: primaryContext.businessId,
            customerId: saleData.customerId || null,
            totalAmount: toDecimalString(saleData.totalAmount),
            paymentMethod: saleData.paymentMethod,
            status: "COMPLETED",
            items: {
              create: saleData.items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: toDecimalString(i.unitPrice),
                totalAmount: toDecimalString(i.totalAmount),
              })),
            },
          },
        });
      });

      expect(sale.id).toBeDefined();

      // Check stock decremented from 10 to 8
      const updatedProd = await prisma.product.findUnique({ where: { id: tempProduct.id } });
      expect(updatedProd?.stockQuantity).toBe(8);

      // Clean up
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
      await prisma.product.delete({ where: { id: tempProduct.id } });
    });
  });

  describe("6. AI Copilot Behavior: Distinguishing Questions, Actions, Ambiguity & Refusal", () => {
    it("should answer a direct question immediately without preparing an action", async () => {
      const res = await runAIAssistant([], "How much did I sell this month?", primaryContext);
      expect(res.message.actionPreview).toBeUndefined();
      expect(res.message.content).toContain("Sales");
    });

    it("should prepare an action preview when given an explicit write request", async () => {
      const res = await runAIAssistant(
        [],
        `Create an invoice for ${sampleCustomer.name} for 2 ${sampleProduct.name}`,
        primaryContext
      );
      expect(res.message.actionPreview).toBeDefined();
      expect(res.message.actionPreview?.actionType).toBe("CREATE_INVOICE");
      expect(res.message.actionPreview?.token).toBeDefined();
    });

    it("should ask for clarification when given an ambiguous action request", async () => {
      const res = await runAIAssistant([], "Sell some power banks", primaryContext);
      expect(res.message.actionPreview).toBeUndefined();
      expect(res.message.content.toLowerCase()).toContain("specify");
    });

    it("should refuse dangerous / destructive operations", async () => {
      const res = await runAIAssistant([], "Delete all my products from the database", primaryContext);
      expect(res.message.actionPreview).toBeUndefined();
      expect(res.message.content).toContain("Refused");
    });
  });

  describe("7. Natural-Language Parsing & Customer Resolution Robustness", () => {
    it("should parse 'Create an invoice for Chinedu for 2 power banks' without capturing 'for' in customer name", () => {
      const parsed = parseInvoiceIntent("Create an invoice for Chinedu for 2 power banks.");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("Chinedu");
      expect(parsed?.items[0].productName).toBe("power banks");
      expect(parsed?.items[0].quantity).toBe(2);
    });

    it("should parse 'Create an invoice for John for 3 shirts'", () => {
      const parsed = parseInvoiceIntent("Create an invoice for John for 3 shirts");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("John");
      expect(parsed?.items[0].productName).toBe("shirts");
      expect(parsed?.items[0].quantity).toBe(3);
    });

    it("should parse 'Invoice Aisha for 5 items'", () => {
      const parsed = parseInvoiceIntent("Invoice Aisha for 5 items");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("Aisha");
      expect(parsed?.items[0].productName).toBe("items");
      expect(parsed?.items[0].quantity).toBe(5);
    });

    it("should parse 'Create an invoice for Chinedu: 2 power banks'", () => {
      const parsed = parseInvoiceIntent("Create an invoice for Chinedu: 2 power banks");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("Chinedu");
      expect(parsed?.items[0].productName).toBe("power banks");
      expect(parsed?.items[0].quantity).toBe(2);
    });

    it("should parse 'Make an invoice for Chinedu with 2 power banks'", () => {
      const parsed = parseInvoiceIntent("Make an invoice for Chinedu with 2 power banks");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("Chinedu");
      expect(parsed?.items[0].productName).toBe("power banks");
      expect(parsed?.items[0].quantity).toBe(2);
    });

    it("should parse 'Create an invoice for Chinedu containing 2 power banks'", () => {
      const parsed = parseInvoiceIntent("Create an invoice for Chinedu containing 2 power banks");
      expect(parsed).toBeDefined();
      expect(parsed?.customerName).toBe("Chinedu");
      expect(parsed?.items[0].productName).toBe("power banks");
      expect(parsed?.items[0].quantity).toBe(2);
    });

    it("should resolve single matching customer candidate in active business directory", async () => {
      const customer = await resolveCustomerCandidate(primaryContext.businessId, sampleCustomer.name);
      expect(customer).toBeDefined();
      expect(customer?.id).toBe(sampleCustomer.id);
    });

    it("should throw a clarification error when multiple ambiguous customers match", async () => {
      // Create two customers with the name prefix "Amaka" in primaryContext
      const c1 = await prisma.customer.create({
        data: { businessId: primaryContext.businessId, name: `Amaka Johnson ${Date.now()}` },
      });
      const c2 = await prisma.customer.create({
        data: { businessId: primaryContext.businessId, name: `Amaka Williams ${Date.now()}` },
      });

      await expect(
        resolveCustomerCandidate(primaryContext.businessId, "Amaka")
      ).rejects.toThrow("Multiple customers found matching");

      // Cleanup
      await prisma.customer.delete({ where: { id: c1.id } });
      await prisma.customer.delete({ where: { id: c2.id } });
    });

    it("should return null / reject when customer is not found in active business", async () => {
      const notFound = await resolveCustomerCandidate(primaryContext.businessId, "UnknownNonExistentPersonXYZ-999");
      expect(notFound).toBeNull();
    });

    it("should maintain strict cross-tenant customer isolation", async () => {
      // sampleCustomer exists in Acme Electronics (primaryContext), not in Beta Retailers (secondaryContext)
      const res = await resolveCustomerCandidate(secondaryContext.businessId, sampleCustomer.name);
      expect(res).toBeNull();
    });

    it("should run full copilot assistant pipeline for 'Create an invoice for Chinedu for 2 power banks'", async () => {
      const res = await runAIAssistant(
        [],
        `Create an invoice for ${sampleCustomer.name} for 2 ${sampleProduct.name}`,
        primaryContext
      );

      expect(res.message.actionPreview).toBeDefined();
      expect(res.message.actionPreview?.actionType).toBe("CREATE_INVOICE");
      const preview = res.message.actionPreview?.preview as { customer: { name: string } };
      expect(preview.customer.name).toBe(sampleCustomer.name);
    });
  });
});
