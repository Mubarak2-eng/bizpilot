-- CreateIndex: Enforce that each business can have at most one WhatsAppConnection
-- Drop old non-unique index if exists
DROP INDEX IF EXISTS "WhatsAppConnection_businessId_idx";

-- Create unique index on businessId
CREATE UNIQUE INDEX "WhatsAppConnection_businessId_key" ON "WhatsAppConnection"("businessId");
