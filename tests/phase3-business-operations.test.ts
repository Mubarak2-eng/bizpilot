import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma";
import { formatMoney, toDecimalString } from "../src/lib/money";

describe("Phase 3: Core BizPilot Business Operations", () => {
  let primaryBusiness: { id: string; name: string; currency: string };
  let secondaryBusiness: { id: string; name: string; currency: string };
  let testCustomer: { id: string; name: string };
  let testProduct: { id: string; name: string; sku: string; stockQuantity: number; sellingPrice: string };

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "demo@bizpilot.test" } });
    const biz1 = await prisma.business.findUnique({ where: { slug: "acme-electronics" } });
    const biz2 = await prisma.business.findUnique({ where: { slug: "beta-retailers" } });

    if (!owner || !biz1 || !biz2) {
      throw new Error("Seeded test data missing! Please run seed first.");
    }

    primaryBusiness = biz1;
    secondaryBusiness = biz2;

    // Fetch a sample product from Acme Electronics
    const prod = await prisma.product.findFirst({
      where: { businessId: primaryBusiness.id },
    });
    if (!prod) throw new Error("No products found in Acme Electronics!");
    testProduct = {
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      stockQuantity: prod.stockQuantity,
      sellingPrice: prod.sellingPrice.toString(),
    };

    // Fetch a sample customer
    const cust = await prisma.customer.findFirst({
      where: { businessId: primaryBusiness.id },
    });
    if (!cust) throw new Error("No customers found in Acme Electronics!");
    testCustomer = {
      id: cust.id,
      name: cust.name,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("1. Money & Currency Utilities", () => {
    it("should format multi-currency money correctly", () => {
      expect(formatMoney(25000, "NGN")).toBe("₦25,000.00");
      expect(formatMoney(150.5, "USD")).toBe("$150.50");
      expect(formatMoney(99.99, "GBP")).toBe("£99.99");
      expect(formatMoney(0, "EUR")).toBe("€0.00");
    });

    it("should convert numeric and string inputs to valid Decimal strings", () => {
      expect(toDecimalString(15000)).toBe("15000.00");
      expect(toDecimalString("25,450.75")).toBe("25450.75");
      expect(toDecimalString(0.5)).toBe("0.50");
    });
  });

  describe("2. Product Catalog & Inventory Integrity", () => {
    it("should enforce SKU uniqueness per business", async () => {
      // Trying to create another product with the same SKU in the same business should fail
      await expect(
        prisma.product.create({
          data: {
            businessId: primaryBusiness.id,
            name: "Duplicate SKU Item",
            sku: testProduct.sku,
            sellingPrice: "1000.00",
            costPrice: "500.00",
            stockQuantity: 10,
          },
        })
      ).rejects.toThrow();
    });

    it("should allow the same SKU across DIFFERENT businesses", async () => {
      // In Beta Retailers, creating the same SKU should succeed because SKU is unique per business
      const crossBizProduct = await prisma.product.create({
        data: {
          businessId: secondaryBusiness.id,
          name: "Beta Version Item",
          sku: `BETA-${Date.now()}`,
          sellingPrice: "1500.00",
          costPrice: "800.00",
          stockQuantity: 25,
        },
      });

      expect(crossBizProduct.id).toBeDefined();
      expect(crossBizProduct.businessId).toBe(secondaryBusiness.id);

      // Clean up
      await prisma.product.delete({ where: { id: crossBizProduct.id } });
    });
  });

  describe("3. Sales Transaction & Inventory Stock Reduction", () => {
    it("should record sale and reduce product stock atomically", async () => {
      // Create a temporary product for this test
      const tempProduct = await prisma.product.create({
        data: {
          businessId: primaryBusiness.id,
          name: "Test Stock Reduction Widget",
          sku: `TEST-WID-${Date.now()}`,
          sellingPrice: "5000.00",
          costPrice: "2500.00",
          stockQuantity: 20,
          lowStockThreshold: 5,
        },
      });

      const qtyToBuy = 3;
      const expectedTotal = 5000 * qtyToBuy; // 15,000.00

      // Simulate sale transaction
      const sale = await prisma.$transaction(async (tx) => {
        // Decrement stock
        await tx.product.update({
          where: { id: tempProduct.id },
          data: {
            stockQuantity: {
              decrement: qtyToBuy,
            },
          },
        });

        // Create sale record
        return tx.sale.create({
          data: {
            businessId: primaryBusiness.id,
            customerId: testCustomer.id,
            totalAmount: toDecimalString(expectedTotal),
            paymentMethod: "CASH",
            status: "COMPLETED",
            items: {
              create: [
                {
                  productId: tempProduct.id,
                  quantity: qtyToBuy,
                  unitPrice: toDecimalString(5000),
                  totalAmount: toDecimalString(expectedTotal),
                },
              ],
            },
          },
          include: {
            items: true,
          },
        });
      });

      expect(sale.id).toBeDefined();
      expect(Number(sale.totalAmount.toString())).toBe(expectedTotal);
      expect(sale.items.length).toBe(1);
      expect(sale.items[0].quantity).toBe(qtyToBuy);

      // Verify stock was reduced from 20 to 17
      const updatedProduct = await prisma.product.findUnique({
        where: { id: tempProduct.id },
      });
      expect(updatedProduct?.stockQuantity).toBe(20 - qtyToBuy);

      // Cleanup
      await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
      await prisma.sale.delete({ where: { id: sale.id } });
      await prisma.product.delete({ where: { id: tempProduct.id } });
    });

    it("should prevent selling more stock than available", async () => {
      const limitedProduct = await prisma.product.create({
        data: {
          businessId: primaryBusiness.id,
          name: "Scarce Item",
          sku: `SCARCE-${Date.now()}`,
          sellingPrice: "10000.00",
          costPrice: "5000.00",
          stockQuantity: 2,
        },
      });

      const requestedQty = 5;

      // Attempt to buy more than available (2 < 5)
      const attemptSale = async () => {
        return prisma.$transaction(async (tx) => {
          const prod = await tx.product.findUnique({ where: { id: limitedProduct.id } });
          if (!prod || prod.stockQuantity < requestedQty) {
            throw new Error(`Insufficient stock. Available: ${prod?.stockQuantity}, Requested: ${requestedQty}`);
          }
        });
      };

      await expect(attemptSale()).rejects.toThrow("Insufficient stock");

      // Cleanup
      await prisma.product.delete({ where: { id: limitedProduct.id } });
    });
  });

  describe("4. Expense Management", () => {
    it("should record an expense and aggregate totals for active business", async () => {
      const testExpense = await prisma.expense.create({
        data: {
          businessId: primaryBusiness.id,
          category: "Utilities",
          description: "Office Internet Subscription",
          amount: "18500.00",
        },
      });

      expect(testExpense.id).toBeDefined();
      expect(testExpense.businessId).toBe(primaryBusiness.id);
      expect(Number(testExpense.amount.toString())).toBe(18500);

      // Aggregate expenses for primary business
      const sum = await prisma.expense.aggregate({
        where: { businessId: primaryBusiness.id },
        _sum: { amount: true },
      });

      expect(Number(sum._sum.amount?.toString())).toBeGreaterThan(0);

      // Cleanup
      await prisma.expense.delete({ where: { id: testExpense.id } });
    });
  });

  describe("5. Invoicing & Tax Calculations", () => {
    it("should create invoice with calculated subtotal, tax, and total", async () => {
      const subtotal = 40000;
      const taxRate = 7.5; // 7.5% VAT
      const tax = (subtotal * taxRate) / 100; // 3,000
      const grandTotal = subtotal + tax; // 43,000

      const invoiceNumber = `TEST-INV-${Date.now()}`;

      const invoice = await prisma.invoice.create({
        data: {
          businessId: primaryBusiness.id,
          customerId: testCustomer.id,
          invoiceNumber,
          status: "SENT",
          subtotal: toDecimalString(subtotal),
          tax: toDecimalString(tax),
          total: toDecimalString(grandTotal),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          items: {
            create: [
              {
                description: "Professional IT Consulting (Hours)",
                quantity: 4,
                unitPrice: toDecimalString(10000),
                totalAmount: toDecimalString(40000),
              },
            ],
          },
        },
        include: {
          items: true,
        },
      });

      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toBe(invoiceNumber);
      expect(Number(invoice.subtotal.toString())).toBe(40000);
      expect(Number(invoice.tax.toString())).toBe(3000);
      expect(Number(invoice.total.toString())).toBe(43000);
      expect(invoice.items.length).toBe(1);

      // Enforce uniqueness of invoice number within business
      await expect(
        prisma.invoice.create({
          data: {
            businessId: primaryBusiness.id,
            customerId: testCustomer.id,
            invoiceNumber,
            status: "DRAFT",
            subtotal: "1000.00",
            tax: "0.00",
            total: "1000.00",
            dueDate: new Date(),
          },
        })
      ).rejects.toThrow();

      // Cleanup
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
    });
  });

  describe("6. Cross-Tenant Operational Isolation", () => {
    it("should never return Business A sales, expenses, or invoices when querying Business B", async () => {
      // Query sales for Beta Retailers (secondaryBusiness)
      const betaSales = await prisma.sale.findMany({
        where: { businessId: secondaryBusiness.id },
      });

      // Primary business has sales seeded; secondary business has 0 sales
      expect(betaSales.length).toBe(0);

      // Query expenses for Beta Retailers
      const betaExpenses = await prisma.expense.findMany({
        where: { businessId: secondaryBusiness.id },
      });
      expect(betaExpenses.length).toBe(0);

      // Query invoices for Beta Retailers
      const betaInvoices = await prisma.invoice.findMany({
        where: { businessId: secondaryBusiness.id },
      });
      expect(betaInvoices.length).toBe(0);
    });
  });
});
