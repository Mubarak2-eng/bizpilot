import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  createSaleAction,
  recordCreditPaymentAction,
  getCreditSaleDetailsAction,
} from "../src/lib/actions/sales";
import {
  get_debtors,
  get_credit_sales,
  get_customer_debt,
} from "../src/lib/ai/tools";
import { AuthenticatedAIContext } from "../src/lib/ai/types";
import { Role } from "../src/types/auth";

// Mock next/cache revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth-helpers so requireBusinessMembership uses real database records
let mockUserId = "";
let mockActiveBusinessId = "";

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
  requireBusinessRole: vi.fn(async (businessId: string, minRole: Role) => {
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

describe("Phase 8: Credit Sales & Customer Debt Tracking", () => {
  let primaryBusiness: { id: string; name: string; currency: string };
  let secondaryBusiness: { id: string; name: string; currency: string };
  let ownerUser: { id: string; email: string; name: string | null };
  let testCustomer: { id: string; name: string };
  let secondaryCustomer: { id: string; name: string };
  let testProduct: { id: string; name: string; sellingPrice: string; stockQuantity: number };

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
    mockActiveBusinessId = biz1.id;

    // Create unique product for testing
    const prod = await prisma.product.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Credit Test Headphones-${Date.now()}`,
        sku: `CR-HP-${Date.now()}`,
        sellingPrice: "20000.00",
        costPrice: "12000.00",
        stockQuantity: 50,
      },
    });
    testProduct = {
      id: prod.id,
      name: prod.name,
      sellingPrice: prod.sellingPrice.toString(),
      stockQuantity: prod.stockQuantity,
    };

    // Create customer in primary business
    const cust = await prisma.customer.create({
      data: {
        businessId: primaryBusiness.id,
        name: `Debtor Client-${Date.now()}`,
        phone: `+2348099${Math.floor(100000 + Math.random() * 900000)}`,
        email: `debtor-${Date.now()}@example.test`,
      },
    });
    testCustomer = cust;

    // Create customer in secondary business
    const cust2 = await prisma.customer.create({
      data: {
        businessId: secondaryBusiness.id,
        name: `Beta Debtor-${Date.now()}`,
      },
    });
    secondaryCustomer = cust2;
  });

  afterAll(async () => {
    try {
      // Clean up sales and credit payments created in this test
      if (testCustomer?.id) {
        const sales = await prisma.sale.findMany({ where: { customerId: testCustomer.id } });
        for (const s of sales) {
          await prisma.creditPayment.deleteMany({ where: { saleId: s.id } });
          await prisma.saleItem.deleteMany({ where: { saleId: s.id } });
          await prisma.sale.delete({ where: { id: s.id } });
        }
        await prisma.customer.delete({ where: { id: testCustomer.id } }).catch(() => {});
      }
      if (secondaryCustomer?.id) {
        await prisma.customer.delete({ where: { id: secondaryCustomer.id } }).catch(() => {});
      }
      if (testProduct?.id) {
        await prisma.saleItem.deleteMany({ where: { productId: testProduct.id } });
        await prisma.product.delete({ where: { id: testProduct.id } }).catch(() => {});
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  describe("1. POS Checkout: Normal vs Credit Sales", () => {
    it("should process a normal cash sale without credit attributes", async () => {
      const initialStock = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.stockQuantity || 0;

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CASH",
        items: [{ productId: testProduct.id, quantity: 1 }],
      });

      expect(res.success).toBe(true);
      expect(res.saleId).toBeDefined();

      const sale = await prisma.sale.findUnique({ where: { id: res.saleId } });
      expect(sale).toBeDefined();
      expect(sale?.isCredit).toBe(false);
      expect(Number(sale?.totalAmount)).toBe(20000);
      expect(Number(sale?.amountPaid)).toBe(20000);
      expect(Number(sale?.outstandingBalance)).toBe(0);
      expect(sale?.creditStatus).toBeNull();

      const updatedProd = await prisma.product.findUnique({ where: { id: testProduct.id } });
      expect(updatedProd?.stockQuantity).toBe(initialStock - 1);
    });

    it("should reject a credit sale if customer is missing", async () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: null,
        creditDueDate: dueDate.toISOString().split("T")[0],
        items: [{ productId: testProduct.id, quantity: 1 }],
      });

      expect(res.error).toMatch(/customer must be selected/i);
    });

    it("should reject a credit sale if credit due date is missing", async () => {
      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: testCustomer.id,
        creditDueDate: null,
        items: [{ productId: testProduct.id, quantity: 1 }],
      });

      expect(res.error).toMatch(/credit due date is required/i);
    });

    it("should record a 100% unpaid credit sale and calculate outstanding balance server-side", async () => {
      const initialStock = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.stockQuantity || 0;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: testCustomer.id,
        creditDueDate: dueDate.toISOString().split("T")[0],
        initialPaymentAmount: 0,
        items: [{ productId: testProduct.id, quantity: 2 }],
      });

      expect(res.success).toBe(true);
      const sale = await prisma.sale.findUnique({ where: { id: res.saleId } });

      expect(sale?.isCredit).toBe(true);
      expect(sale?.paymentMethod).toBe("CREDIT");
      expect(Number(sale?.totalAmount)).toBe(40000);
      expect(Number(sale?.amountPaid)).toBe(0);
      expect(Number(sale?.outstandingBalance)).toBe(40000);
      expect(sale?.creditStatus).toBe("UNPAID");

      // Verify inventory deducted atomically
      const updatedProd = await prisma.product.findUnique({ where: { id: testProduct.id } });
      expect(updatedProd?.stockQuantity).toBe(initialStock - 2);
    });

    it("should record a credit sale with partial deposit and log initial CreditPayment", async () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: testCustomer.id,
        creditDueDate: dueDate.toISOString().split("T")[0],
        initialPaymentAmount: 10000,
        initialPaymentMethod: "TRANSFER",
        items: [{ productId: testProduct.id, quantity: 1 }],
      });

      expect(res.success).toBe(true);
      const sale = await prisma.sale.findUnique({
        where: { id: res.saleId },
        include: { creditPayments: true },
      });

      expect(sale?.isCredit).toBe(true);
      expect(Number(sale?.totalAmount)).toBe(20000);
      expect(Number(sale?.amountPaid)).toBe(10000);
      expect(Number(sale?.outstandingBalance)).toBe(10000);
      expect(sale?.creditStatus).toBe("PARTIALLY_PAID");

      // Verify initial deposit logged in CreditPayment
      expect(sale?.creditPayments.length).toBe(1);
      expect(Number(sale?.creditPayments[0].amount)).toBe(10000);
      expect(sale?.creditPayments[0].paymentMethod).toBe("TRANSFER");
    });
  });

  describe("2. Repayments & Debt Settlement Workflow", () => {
    let activeCreditSaleId = "";

    beforeAll(async () => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: testCustomer.id,
        creditDueDate: dueDate.toISOString().split("T")[0],
        initialPaymentAmount: 0,
        items: [{ productId: testProduct.id, quantity: 3 }], // 60,000 total
      });
      activeCreditSaleId = res.saleId!;
    });

    it("should reject zero or negative repayment amounts", async () => {
      const res1 = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 0,
        paymentMethod: "CASH",
      });
      expect(res1.error).toMatch(/greater than 0/i);

      const res2 = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: -5000,
        paymentMethod: "CASH",
      });
      expect(res2.error).toMatch(/greater than 0/i);
    });

    it("should reject 'CREDIT' as a repayment method", async () => {
      const res = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 10000,
        paymentMethod: "CREDIT" as any,
      });
      expect(res.error).toMatch(/invalid repayment method/i);
    });

    it("should reject overpayment exceeding the outstanding balance", async () => {
      const res = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 75000, // exceeds 60,000
        paymentMethod: "CASH",
      });
      expect(res.error).toMatch(/exceeds outstanding balance/i);
    });

    it("should record a partial repayment and update status to PARTIALLY_PAID", async () => {
      const res = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 25000,
        paymentMethod: "TRANSFER",
        note: "Partial transfer payment",
      });

      expect(res.success).toBe(true);

      const sale = await prisma.sale.findUnique({
        where: { id: activeCreditSaleId },
        include: { creditPayments: true },
      });

      expect(Number(sale?.amountPaid)).toBe(25000);
      expect(Number(sale?.outstandingBalance)).toBe(35000);
      expect(sale?.creditStatus).toBe("PARTIALLY_PAID");
      expect(sale?.creditPayments.length).toBe(1);
      expect(sale?.creditPayments[0].note).toBe("Partial transfer payment");
    });

    it("should record final repayment, set outstandingBalance to 0, and transition status to PAID", async () => {
      const res = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 35000, // remaining balance
        paymentMethod: "CASH",
        note: "Final cash settlement",
      });

      expect(res.success).toBe(true);

      const sale = await prisma.sale.findUnique({
        where: { id: activeCreditSaleId },
        include: { creditPayments: true },
      });

      expect(Number(sale?.amountPaid)).toBe(60000);
      expect(Number(sale?.outstandingBalance)).toBe(0);
      expect(sale?.creditStatus).toBe("PAID");
      expect(sale?.creditPayments.length).toBe(2);
    });

    it("should reject any further repayments on a fully settled credit sale", async () => {
      const res = await recordCreditPaymentAction(primaryBusiness.id, activeCreditSaleId, {
        amount: 5000,
        paymentMethod: "CASH",
      });
      expect(res.error).toMatch(/already been fully settled/i);
    });
  });

  describe("3. Overdue Debt Identification & Cross-Tenant Security", () => {
    let overdueCreditSaleId = "";

    beforeAll(async () => {
      // Create an overdue credit sale with a past due date
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 5);

      const res = await createSaleAction(primaryBusiness.id, {
        paymentMethod: "CREDIT",
        customerId: testCustomer.id,
        creditDueDate: pastDueDate.toISOString().split("T")[0],
        initialPaymentAmount: 0,
        items: [{ productId: testProduct.id, quantity: 1 }],
      });
      overdueCreditSaleId = res.saleId!;
    });

    it("should classify past-due credit sale with outstanding balance as OVERDUE", async () => {
      const sale = await prisma.sale.findUnique({ where: { id: overdueCreditSaleId } });
      expect(sale?.creditStatus).toBe("OVERDUE");
      expect(Number(sale?.outstandingBalance)).toBe(20000);
    });

    it("should prevent cross-tenant credit repayment manipulation", async () => {
      // Attempting to repay primary business's sale from secondary business context
      const res = await recordCreditPaymentAction(secondaryBusiness.id, overdueCreditSaleId, {
        amount: 5000,
        paymentMethod: "CASH",
      });

      expect(res.error).toMatch(/not found or does not belong to this business/i);
    });

    it("should fetch full credit sale history including installments via getCreditSaleDetailsAction", async () => {
      const details = await getCreditSaleDetailsAction(primaryBusiness.id, overdueCreditSaleId);
      expect(details.success).toBe(true);
      expect(details.sale).toBeDefined();
      expect(details.sale?.customer?.name).toBe(testCustomer.name);
      expect(details.sale?.isCredit).toBe(true);
      expect(Array.isArray(details.sale?.payments)).toBe(true);
    });
  });

  describe("4. AI Assistant Read-Only Credit Tools", () => {
    const aiContext: AuthenticatedAIContext = {
      userId: "",
      businessId: "",
      businessName: "Acme Electronics",
      currency: "NGN",
      role: Role.OWNER,
    };

    beforeAll(() => {
      aiContext.userId = ownerUser.id;
      aiContext.businessId = primaryBusiness.id;
    });

    it("get_debtors should return list of customers with outstanding balances", async () => {
      const result = await get_debtors({}, aiContext);
      expect(result.totalDebtors).toBeGreaterThanOrEqual(1);
      expect(result.totalReceivables).toBeGreaterThan(0);
      expect(Array.isArray(result.debtors)).toBe(true);

      const debtor = result.debtors.find((d) => d.customerId === testCustomer.id);
      expect(debtor).toBeDefined();
      expect(debtor?.customerName).toBe(testCustomer.name);
      expect(debtor?.totalOutstandingDebt).toBeGreaterThan(0);
    });

    it("get_credit_sales should return credit sales with date and status filters", async () => {
      const result = await get_credit_sales({ datePhrase: "this_month" }, aiContext);
      expect(result.totalRecords).toBeGreaterThanOrEqual(1);
      expect(result.totalCreditGranted).toBeGreaterThan(0);
      expect(Array.isArray(result.sales)).toBe(true);
    });

    it("get_customer_debt should return detailed debt ledger for a specific customer", async () => {
      const result = await get_customer_debt({ customerName: testCustomer.name }, aiContext);
      expect("customer" in result).toBe(true);
      if ("customer" in result && result.customer) {
        expect(result.customer.name).toBe(testCustomer.name);
        expect(result.hasDebt).toBe(true);
        expect(result.creditSales.length).toBeGreaterThanOrEqual(1);
        expect(result.totalOutstanding).toBeGreaterThan(0);
      }
    });
  });
});
