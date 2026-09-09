-- Migration: Update PRO plan monthlyPrice from 5000 to 12000 NGN
-- This is a data migration to reflect the canonical PRO plan pricing.
-- ensureDefaultPlans() also performs an upsert on every startup, so
-- this migration guarantees production databases are corrected immediately
-- without waiting for the next cold start.

UPDATE "Plan"
SET "monthlyPrice" = 12000.00
WHERE "code" = 'PRO'
  AND "monthlyPrice" = 5000.00;
