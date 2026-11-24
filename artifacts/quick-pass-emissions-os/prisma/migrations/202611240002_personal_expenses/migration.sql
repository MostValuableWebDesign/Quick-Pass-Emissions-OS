CREATE TABLE "PersonalExpense" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "title" TEXT NOT NULL, "amountCents" INTEGER, "vendor" TEXT NOT NULL DEFAULT '',
 "date" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'Uncategorized',
 "purpose" TEXT NOT NULL DEFAULT '', "paymentMethod" TEXT NOT NULL DEFAULT '',
 "planned" BOOLEAN NOT NULL DEFAULT TRUE, "version" INTEGER NOT NULL DEFAULT 1,
 "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "expense_amount_nonnegative" CHECK ("amountCents" IS NULL OR "amountCents" >= 0)
);
CREATE INDEX "PersonalExpense_userId_date_idx" ON "PersonalExpense"("userId","date");
CREATE TABLE "PersonalExpenseEntry" (
 "id" TEXT PRIMARY KEY, "expenseId" TEXT NOT NULL REFERENCES "PersonalExpense"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('PAYMENT','REFUND','REIMBURSEMENT','REIMBURSEMENT_RETURN')),
 "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0), "date" TEXT NOT NULL,
 "fundingSource" TEXT NOT NULL DEFAULT 'BUSINESS' CHECK ("fundingSource" IN ('BUSINESS','PERSONAL')),
 "paymentMethod" TEXT NOT NULL DEFAULT '', "note" TEXT NOT NULL DEFAULT '',
 "voidedAt" TIMESTAMP(3), "voidReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PersonalExpenseEntry_expenseId_date_idx" ON "PersonalExpenseEntry"("expenseId","date");
CREATE TABLE "PersonalExpenseLink" (
 "id" TEXT PRIMARY KEY, "expenseId" TEXT NOT NULL REFERENCES "PersonalExpense"("id") ON DELETE CASCADE,
 "sourceKey" TEXT NOT NULL, "noteId" TEXT REFERENCES "PersonalNote"("id") ON DELETE CASCADE,
 "taskId" TEXT REFERENCES "PersonalTask"("id") ON DELETE CASCADE,
 CONSTRAINT "expense_link_one_source" CHECK (("noteId" IS NULL) <> ("taskId" IS NULL))
);
CREATE UNIQUE INDEX "PersonalExpenseLink_expenseId_sourceKey_key" ON "PersonalExpenseLink"("expenseId","sourceKey");
CREATE TABLE "PersonalExpenseAttachment" (
 "id" TEXT PRIMARY KEY, "expenseId" TEXT NOT NULL REFERENCES "PersonalExpense"("id") ON DELETE CASCADE,
 "filename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
 "objectPath" TEXT NOT NULL UNIQUE, "uploadedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PersonalExpenseHistory" (
 "id" TEXT PRIMARY KEY, "expenseId" TEXT NOT NULL REFERENCES "PersonalExpense"("id") ON DELETE CASCADE,
 "action" TEXT NOT NULL, "detail" TEXT NOT NULL DEFAULT '', "snapshot" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PersonalExpenseHistory_expenseId_createdAt_idx" ON "PersonalExpenseHistory"("expenseId","createdAt");
