-- CreateTable
CREATE TABLE "LoginPin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCooldownUntil" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginPin_userId_idx" ON "LoginPin"("userId");

-- CreateIndex
CREATE INDEX "LoginPin_email_idx" ON "LoginPin"("email");

-- CreateIndex
CREATE INDEX "LoginPin_expiresAt_idx" ON "LoginPin"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginPin" ADD CONSTRAINT "LoginPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
