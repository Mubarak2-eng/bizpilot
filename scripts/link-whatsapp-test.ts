import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "234" + digits.slice(1);
  }
  return digits;
}

async function linkWhatsAppTest() {
  const rawPhone = process.env.TEST_WHATSAPP_PHONE;
  if (!rawPhone || !rawPhone.trim()) {
    console.error("❌ Error: TEST_WHATSAPP_PHONE environment variable is not set.");
    console.log("Usage example: TEST_WHATSAPP_PHONE=2348012345678 npx tsx scripts/link-whatsapp-test.ts");
    process.exit(1);
  }

  const normalizedPhone = normalizePhoneNumber(rawPhone);
  if (!normalizedPhone || normalizedPhone.length < 7) {
    console.error("❌ Error: TEST_WHATSAPP_PHONE is not a valid phone number.");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({
      where: { email: "demo@bizpilot.test" },
      select: { id: true, email: true },
    });

    if (!user) {
      console.error("❌ Error: Demo user (demo@bizpilot.test) not found in the database.");
      process.exit(1);
    }

    const business = await prisma.business.findUnique({
      where: { slug: "acme-electronics" },
      select: { id: true, name: true, slug: true },
    });

    if (!business) {
      console.error("❌ Error: Business (acme-electronics) not found in the database.");
      process.exit(1);
    }

    const connection = await prisma.whatsAppConnection.upsert({
      where: { phoneNumber: normalizedPhone },
      create: {
        phoneNumber: normalizedPhone,
        userId: user.id,
        businessId: business.id,
        verified: true,
      },
      update: {
        userId: user.id,
        businessId: business.id,
        verified: true,
      },
    });

    console.log(`✅ WhatsApp Connection verified and linked.`);
    console.log(`Phone: ${connection.phoneNumber}`);
    console.log(`Status: ${connection.verified ? "VERIFIED" : "UNVERIFIED"}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown database error";
    console.error(`❌ Failed to link WhatsApp connection: ${errorMsg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

linkWhatsAppTest();
