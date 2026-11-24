CREATE TABLE "PersonalFolder" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonalFolder_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PersonalFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PersonalFolder_userId_name_key" ON "PersonalFolder"("userId", "name");
CREATE TABLE "PersonalNote" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "folderId" TEXT,
 "title" TEXT NOT NULL DEFAULT '', "body" TEXT NOT NULL DEFAULT '',
 "checklist" JSONB NOT NULL DEFAULT '[]', "pinned" BOOLEAN NOT NULL DEFAULT false,
 "archivedAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PersonalNote_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PersonalNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "PersonalNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "PersonalFolder"("id") ON DELETE SET NULL
);
CREATE INDEX "PersonalNote_userId_deletedAt_archivedAt_idx" ON "PersonalNote"("userId", "deletedAt", "archivedAt");
CREATE TABLE "PersonalTask" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "noteId" TEXT, "sourceKey" TEXT NOT NULL,
 "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "dueDate" TEXT,
 "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'TODO',
 "completionNote" TEXT NOT NULL DEFAULT '', "completedAt" TIMESTAMP(3),
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PersonalTask_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PersonalTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
 CONSTRAINT "PersonalTask_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PersonalNote"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "PersonalTask_userId_sourceKey_key" ON "PersonalTask"("userId", "sourceKey");
CREATE INDEX "PersonalTask_userId_status_dueDate_idx" ON "PersonalTask"("userId", "status", "dueDate");
CREATE TABLE "PersonalTaskEvent" (
 "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
 "completionNote" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'TODO',
 "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "dueDate" TEXT, "completedAt" TIMESTAMP(3),
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonalTaskEvent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PersonalTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PersonalTask"("id") ON DELETE CASCADE
);
CREATE INDEX "PersonalTaskEvent_taskId_occurredAt_idx" ON "PersonalTaskEvent"("taskId", "occurredAt");
CREATE TABLE "PersonalSummary" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "startDate" TEXT NOT NULL, "endDate" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonalSummary_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PersonalSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PersonalSummary_userId_startDate_endDate_key" ON "PersonalSummary"("userId", "startDate", "endDate");
CREATE TABLE "PersonalSummarySchedule" (
 "userId" TEXT NOT NULL, "firstDate" TEXT NOT NULL, "nextDate" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT false, "lastRunAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PersonalSummarySchedule_pkey" PRIMARY KEY ("userId"),
 CONSTRAINT "PersonalSummarySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE TABLE "PersonalSummaryRunner" (
 "id" TEXT NOT NULL DEFAULT 'personal', "lastRunAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PersonalSummaryRunner_pkey" PRIMARY KEY ("id")
);
