-- CreateTable
CREATE TABLE "WhatsAppRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppRateLimit_key_key" ON "WhatsAppRateLimit"("key");

-- CreateIndex
CREATE INDEX "WhatsAppRateLimit_key_idx" ON "WhatsAppRateLimit"("key");

-- CreateIndex
CREATE INDEX "WhatsAppRateLimit_resetAt_idx" ON "WhatsAppRateLimit"("resetAt");
