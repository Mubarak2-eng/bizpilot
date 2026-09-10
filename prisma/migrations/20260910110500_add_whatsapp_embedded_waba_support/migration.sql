-- CreateEnum
CREATE TYPE "WhatsAppConnectionType" AS ENUM ('INTERNAL_ASSISTANT', 'EMBEDDED_WABA');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'RESTRICTED');

-- AlterTable
ALTER TABLE "WhatsAppConnection" ADD COLUMN     "businessProfileName" TEXT,
ADD COLUMN     "connectionType" "WhatsAppConnectionType" NOT NULL DEFAULT 'INTERNAL_ASSISTANT',
ADD COLUMN     "phoneNumberId" TEXT,
ADD COLUMN     "qualityRating" TEXT,
ADD COLUMN     "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
ADD COLUMN     "wabaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_phoneNumberId_idx" ON "WhatsAppConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_wabaId_idx" ON "WhatsAppConnection"("wabaId");
