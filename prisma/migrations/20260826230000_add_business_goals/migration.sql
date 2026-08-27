-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('MONTHLY_REVENUE', 'MONTHLY_PROFIT', 'INVENTORY_TURNOVER', 'RECEIVABLES_COLLECTION', 'CUSTOMER_GROWTH');

-- CreateTable
CREATE TABLE "BusinessGoal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "targetValue" DECIMAL(12,2) NOT NULL,
    "currentValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "periodKey" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isAchieved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessGoal_businessId_idx" ON "BusinessGoal"("businessId");

-- CreateIndex
CREATE INDEX "BusinessGoal_businessId_periodKey_idx" ON "BusinessGoal"("businessId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessGoal_businessId_type_periodKey_key" ON "BusinessGoal"("businessId", "type", "periodKey");

-- AddForeignKey
ALTER TABLE "BusinessGoal" ADD CONSTRAINT "BusinessGoal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
