-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDIT';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "creditDueDate" TIMESTAMP(3),
ADD COLUMN     "creditStatus" "CreditStatus",
ADD COLUMN     "isCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditPayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPayment_saleId_idx" ON "CreditPayment"("saleId");

-- CreateIndex
CREATE INDEX "CreditPayment_businessId_idx" ON "CreditPayment"("businessId");

-- CreateIndex
CREATE INDEX "CreditPayment_businessId_createdAt_idx" ON "CreditPayment"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_businessId_isCredit_idx" ON "Sale"("businessId", "isCredit");

-- CreateIndex
CREATE INDEX "Sale_businessId_creditStatus_idx" ON "Sale"("businessId", "creditStatus");

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
