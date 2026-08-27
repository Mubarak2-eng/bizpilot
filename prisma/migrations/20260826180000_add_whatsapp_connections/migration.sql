-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumber_key" ON "WhatsAppConnection"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_phoneNumber_idx" ON "WhatsAppConnection"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_businessId_idx" ON "WhatsAppConnection"("businessId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_userId_idx" ON "WhatsAppConnection"("userId");

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
