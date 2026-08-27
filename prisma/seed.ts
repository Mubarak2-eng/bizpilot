import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Production Safety Guard: Prevent accidental data wipe and demo seeding in production
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    console.warn("⚠️ [Seed Safety Guard] Production environment detected (NODE_ENV=production).");
    console.warn("⚠️ Seeding demo/Acme data is BLOCKED to protect production records.");
    console.warn("⚠️ Set ALLOW_PRODUCTION_SEED=true if you explicitly intend to seed this database.");
    return;
  }

  console.log("🌱 Seeding BizPilot database...\n");

  // ── Clean existing data (in reverse dependency order) ──────────────────
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
  // ── Plans ───────────────────────────────────────────────────────────────
  const PLAN_DEFINITIONS = [
    {
      code: "FREE",
      name: "BizPilot Free",
      description: "For trying BizPilot and exploring core business operations.",
      monthlyPrice: 0,
      currency: "NGN",
      aiMonthlyLimit: 25,
      maxStaff: 2,
    },
    {
      code: "STARTER",
      name: "BizPilot Starter",
      description: "For small businesses looking to streamline everyday sales and reporting.",
      monthlyPrice: 5000,
      currency: "NGN",
      aiMonthlyLimit: 150,
      maxStaff: 5,
    },
    {
      code: "PRO",
      name: "BizPilot Pro",
      description: "For growing SMEs needing proactive AI business management and actions.",
      monthlyPrice: 12000,
      currency: "NGN",
      aiMonthlyLimit: 500,
      maxStaff: 10,
    },
    {
      code: "BUSINESS",
      name: "BizPilot Business",
      description: "For established businesses with high transaction volume and multiple staff.",
      monthlyPrice: 25000,
      currency: "NGN",
      aiMonthlyLimit: 1500,
      maxStaff: 25,
    },
  ] as const;

  for (const planDef of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { code: planDef.code },
      create: {
        code: planDef.code,
        name: planDef.name,
        description: planDef.description,
        monthlyPrice: planDef.monthlyPrice,
        currency: planDef.currency,
        aiMonthlyLimit: planDef.aiMonthlyLimit,
        maxStaff: planDef.maxStaff,
        isActive: true,
      },
      update: {
        name: planDef.name,
        description: planDef.description,
        monthlyPrice: planDef.monthlyPrice,
        currency: planDef.currency,
        aiMonthlyLimit: planDef.aiMonthlyLimit,
        maxStaff: planDef.maxStaff,
        isActive: true,
      },
    });
  }
  console.log(`✅ Plans seeded: ${PLAN_DEFINITIONS.length}`);

  const hashedPassword = await bcrypt.hash("DemoPassword123!", 10);

  // ── Users ──────────────────────────────────────────────────────────────
  const ownerUser = await prisma.user.create({
    data: {
      name: "Demo Owner",
      email: "demo@bizpilot.test",
      emailVerified: new Date(),
      password: hashedPassword,
    },
  });
  console.log(`✅ Owner User created: ${ownerUser.name} (${ownerUser.email})`);

  const adminUser = await prisma.user.create({
    data: {
      name: "Demo Admin",
      email: "admin@bizpilot.test",
      emailVerified: new Date(),
      password: hashedPassword,
    },
  });
  console.log(`✅ Admin User created: ${adminUser.name} (${adminUser.email})`);

  const staffUser = await prisma.user.create({
    data: {
      name: "Demo Staff",
      email: "staff@bizpilot.test",
      emailVerified: new Date(),
      password: hashedPassword,
    },
  });
  console.log(`✅ Staff User created: ${staffUser.name} (${staffUser.email})`);

  // ── Business ───────────────────────────────────────────────────────────
  const business = await prisma.business.create({
    data: {
      name: "Acme Electronics",
      slug: "acme-electronics",
      currency: "NGN",
    },
  });
  console.log(`✅ Business created: ${business.name}`);

  // Second demo business for multi-tenant isolation testing
  const secondBusiness = await prisma.business.create({
    data: {
      name: "Beta Retailers",
      slug: "beta-retailers",
      currency: "NGN",
    },
  });
  console.log(`✅ Second Business created: ${secondBusiness.name}`);

  // ── Memberships ────────────────────────────────────────────────────────
  await prisma.membership.createMany({
    data: [
      {
        userId: ownerUser.id,
        businessId: business.id,
        role: "OWNER",
      },
      {
        userId: adminUser.id,
        businessId: business.id,
        role: "ADMIN",
      },
      {
        userId: staffUser.id,
        businessId: business.id,
        role: "STAFF",
      },
      {
        userId: ownerUser.id,
        businessId: secondBusiness.id,
        role: "OWNER",
      },
    ],
  });
  console.log(`✅ Memberships created for Acme Electronics & Beta Retailers`);

  // ── Products ───────────────────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({
      data: {
        businessId: business.id,
        name: "Wireless Bluetooth Headphones",
        sku: "ACME-WBH-001",
        barcode: "6001234500001",
        description: "Premium noise-cancelling wireless headphones",
        sellingPrice: "25000.00",
        costPrice: "15000.00",
        stockQuantity: 50,
        lowStockThreshold: 10,
      },
    }),
    prisma.product.create({
      data: {
        businessId: business.id,
        name: "USB-C Charging Cable (1m)",
        sku: "ACME-UCC-002",
        barcode: "6001234500002",
        description: "Durable braided USB-C cable, 1 metre",
        sellingPrice: "3500.00",
        costPrice: "1200.00",
        stockQuantity: 200,
        lowStockThreshold: 30,
      },
    }),
    prisma.product.create({
      data: {
        businessId: business.id,
        name: "Portable Power Bank 10000mAh",
        sku: "ACME-PPB-003",
        barcode: "6001234500003",
        description: "Compact 10000mAh power bank with dual output",
        sellingPrice: "12000.00",
        costPrice: "7000.00",
        stockQuantity: 80,
        lowStockThreshold: 15,
      },
    }),
    prisma.product.create({
      data: {
        businessId: business.id,
        name: "Laptop Stand (Adjustable)",
        sku: "ACME-LSA-004",
        description: "Ergonomic aluminium laptop stand",
        sellingPrice: "18000.00",
        costPrice: "10000.00",
        stockQuantity: 35,
        lowStockThreshold: 5,
      },
    }),
    prisma.product.create({
      data: {
        businessId: business.id,
        name: "Screen Protector (Universal)",
        sku: "ACME-SPU-005",
        barcode: "6001234500005",
        description: "Tempered glass screen protector, fits most phones",
        sellingPrice: "2500.00",
        costPrice: "800.00",
        stockQuantity: 300,
        lowStockThreshold: 50,
      },
    }),
  ]);
  console.log(`✅ Products created: ${products.length}`);

  // ── Customers ──────────────────────────────────────────────────────────
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Chinedu Okafor",
        phone: "+2348012345678",
        email: "chinedu@example.test",
        address: "42 Marina Road, Lagos Island, Lagos",
      },
    }),
    prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Aisha Bello",
        phone: "+2348023456789",
        email: "aisha@example.test",
        address: "15 Kano Road, Abuja",
      },
    }),
    prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Tunde Adeyemi",
        phone: "+2348034567890",
        email: "tunde@example.test",
        address: "7 Dugbe Street, Ibadan",
      },
    }),
    prisma.customer.create({
      data: {
        businessId: business.id,
        name: "Grace Eze",
        phone: "+2348045678901",
        address: "23 Ogui Road, Enugu",
      },
    }),
  ]);
  console.log(`✅ Customers created: ${customers.length}`);

  // ── Sales & SaleItems ──────────────────────────────────────────────────
  const sale1 = await prisma.sale.create({
    data: {
      businessId: business.id,
      customerId: customers[0].id,
      totalAmount: "53500.00",
      paymentMethod: "TRANSFER",
      status: "COMPLETED",
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            unitPrice: "25000.00",
            totalAmount: "25000.00",
          },
          {
            productId: products[0 + 1].id,
            quantity: 2,
            unitPrice: "3500.00",
            totalAmount: "7000.00",
          },
          {
            productId: products[2].id,
            quantity: 1,
            unitPrice: "12000.00",
            totalAmount: "12000.00",
          },
        ],
      },
    },
  });

  const sale2 = await prisma.sale.create({
    data: {
      businessId: business.id,
      customerId: customers[1].id,
      totalAmount: "18000.00",
      paymentMethod: "CARD",
      status: "COMPLETED",
      items: {
        create: [
          {
            productId: products[3].id,
            quantity: 1,
            unitPrice: "18000.00",
            totalAmount: "18000.00",
          },
        ],
      },
    },
  });

  const sale3 = await prisma.sale.create({
    data: {
      businessId: business.id,
      totalAmount: "5000.00",
      paymentMethod: "CASH",
      status: "COMPLETED",
      items: {
        create: [
          {
            productId: products[4].id,
            quantity: 2,
            unitPrice: "2500.00",
            totalAmount: "5000.00",
          },
        ],
      },
    },
  });

  const sale4 = await prisma.sale.create({
    data: {
      businessId: business.id,
      customerId: customers[2].id,
      totalAmount: "37000.00",
      paymentMethod: "MOBILE_MONEY",
      status: "COMPLETED",
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            unitPrice: "25000.00",
            totalAmount: "25000.00",
          },
          {
            productId: products[2].id,
            quantity: 1,
            unitPrice: "12000.00",
            totalAmount: "12000.00",
          },
        ],
      },
    },
  });
  console.log(`✅ Sales created: 4 (${[sale1, sale2, sale3, sale4].length} with items)`);

  // ── Expenses ───────────────────────────────────────────────────────────
  const expenses = await Promise.all([
    prisma.expense.create({
      data: {
        businessId: business.id,
        category: "Rent",
        description: "Monthly shop rent — August 2025",
        amount: "150000.00",
      },
    }),
    prisma.expense.create({
      data: {
        businessId: business.id,
        category: "Utilities",
        description: "Electricity bill — August 2025",
        amount: "25000.00",
      },
    }),
    prisma.expense.create({
      data: {
        businessId: business.id,
        category: "Supplies",
        description: "Packaging materials restock",
        amount: "8000.00",
      },
    }),
    prisma.expense.create({
      data: {
        businessId: business.id,
        category: "Marketing",
        description: "Instagram ad campaign — August 2025",
        amount: "35000.00",
      },
    }),
    prisma.expense.create({
      data: {
        businessId: business.id,
        category: "Transport",
        description: "Delivery rider fuel allowance",
        amount: "12000.00",
      },
    }),
  ]);
  console.log(`✅ Expenses created: ${expenses.length}`);

  // ── Invoice & InvoiceItems ─────────────────────────────────────────────
  const invoice = await prisma.invoice.create({
    data: {
      businessId: business.id,
      customerId: customers[0].id,
      invoiceNumber: "INV-2025-0001",
      status: "SENT",
      subtotal: "43000.00",
      tax: "3225.00",
      total: "46225.00",
      dueDate: new Date("2025-09-15"),
      items: {
        create: [
          {
            productId: products[0].id,
            description: "Wireless Bluetooth Headphones",
            quantity: 1,
            unitPrice: "25000.00",
            totalAmount: "25000.00",
          },
          {
            productId: products[3].id,
            description: "Laptop Stand (Adjustable)",
            quantity: 1,
            unitPrice: "18000.00",
            totalAmount: "18000.00",
          },
        ],
      },
    },
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      businessId: business.id,
      customerId: customers[2].id,
      invoiceNumber: "INV-2025-0002",
      status: "PAID",
      subtotal: "7000.00",
      tax: "525.00",
      total: "7525.00",
      dueDate: new Date("2025-08-30"),
      items: {
        create: [
          {
            productId: products[1].id,
            description: "USB-C Charging Cable (1m) × 2",
            quantity: 2,
            unitPrice: "3500.00",
            totalAmount: "7000.00",
          },
        ],
      },
    },
  });
  console.log(`✅ Invoices created: 2 (${[invoice, invoice2].length})`);

  console.log("\n🎉 Seed completed successfully!\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
