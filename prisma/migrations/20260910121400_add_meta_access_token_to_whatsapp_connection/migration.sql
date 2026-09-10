-- AlterTable: Add per-business Meta WABA access token column
-- This stores the customer's WABA-scoped access token obtained during Embedded Signup.
-- SECURITY: This column must NEVER be selected in UI-facing queries or exposed to the browser.
ALTER TABLE "WhatsAppConnection" ADD COLUMN "metaAccessToken" TEXT;
