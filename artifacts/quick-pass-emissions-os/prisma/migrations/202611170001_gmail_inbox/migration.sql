CREATE TYPE "InboxImportance" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "GmailInboxAnnotation" (
    "id" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Uncategorized',
    "importance" "InboxImportance" NOT NULL DEFAULT 'NORMAL',
    "followUp" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GmailInboxAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailInboxAnnotation_accountEmail_messageId_key"
    ON "GmailInboxAnnotation"("accountEmail", "messageId");
CREATE INDEX "GmailInboxAnnotation_accountEmail_followUp_importance_idx"
    ON "GmailInboxAnnotation"("accountEmail", "followUp", "importance");
ALTER TABLE "GmailInboxAnnotation"
    ADD CONSTRAINT "GmailInboxAnnotation_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
