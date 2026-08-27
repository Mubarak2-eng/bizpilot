-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RETAIL', 'RESTAURANT', 'PHARMACY', 'FASHION', 'ELECTRONICS', 'SALON', 'SUPERMARKET', 'OTHER');

-- AlterTable Business: Add businessType with default 'OTHER'
ALTER TABLE "Business" ADD COLUMN "businessType" "BusinessType" NOT NULL DEFAULT 'OTHER';

-- AlterTable WhatsAppConnection: Update default for verified to false, add OTP verification fields
ALTER TABLE "WhatsAppConnection" ALTER COLUMN "verified" SET DEFAULT false;
ALTER TABLE "WhatsAppConnection" ADD COLUMN "verificationCodeHash" TEXT;
ALTER TABLE "WhatsAppConnection" ADD COLUMN "verificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppConnection" ADD COLUMN "verificationAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WhatsAppConnection" ADD COLUMN "verificationRequestedAt" TIMESTAMP(3);
