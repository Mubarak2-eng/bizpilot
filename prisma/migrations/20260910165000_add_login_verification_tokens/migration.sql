-- CreateTable
CREATE TABLE "LoginVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginVerificationToken_userId_idx" ON "LoginVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "LoginVerificationToken_expiresAt_idx" ON "LoginVerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginVerificationToken" ADD CONSTRAINT "LoginVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
