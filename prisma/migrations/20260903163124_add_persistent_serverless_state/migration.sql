-- CreateTable
CREATE TABLE "WhatsAppProcessedMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversationSession" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "businessId" TEXT,
    "activeActionToken" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPendingAction" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppProcessedMessage_messageId_key" ON "WhatsAppProcessedMessage"("messageId");

-- CreateIndex
CREATE INDEX "WhatsAppProcessedMessage_messageId_idx" ON "WhatsAppProcessedMessage"("messageId");

-- CreateIndex
CREATE INDEX "WhatsAppProcessedMessage_createdAt_idx" ON "WhatsAppProcessedMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppProcessedMessage_businessId_idx" ON "WhatsAppProcessedMessage"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversationSession_phoneNumber_key" ON "WhatsAppConversationSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppConversationSession_phoneNumber_idx" ON "WhatsAppConversationSession"("phoneNumber");

-- CreateIndex
CREATE INDEX "WhatsAppConversationSession_businessId_idx" ON "WhatsAppConversationSession"("businessId");

-- CreateIndex
CREATE INDEX "WhatsAppConversationSession_lastActivity_idx" ON "WhatsAppConversationSession"("lastActivity");

-- CreateIndex
CREATE UNIQUE INDEX "AIPendingAction_token_key" ON "AIPendingAction"("token");

-- CreateIndex
CREATE INDEX "AIPendingAction_token_idx" ON "AIPendingAction"("token");

-- CreateIndex
CREATE INDEX "AIPendingAction_userId_idx" ON "AIPendingAction"("userId");

-- CreateIndex
CREATE INDEX "AIPendingAction_businessId_idx" ON "AIPendingAction"("businessId");

-- CreateIndex
CREATE INDEX "AIPendingAction_expiresAt_idx" ON "AIPendingAction"("expiresAt");

-- AddForeignKey
ALTER TABLE "WhatsAppProcessedMessage" ADD CONSTRAINT "WhatsAppProcessedMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversationSession" ADD CONSTRAINT "WhatsAppConversationSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPendingAction" ADD CONSTRAINT "AIPendingAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPendingAction" ADD CONSTRAINT "AIPendingAction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
