ALTER TABLE "PersonalNote"
 ADD COLUMN "polishedSummary" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "polishedOriginal" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "polishedSource" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "polishedAnswers" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "polishedAt" TIMESTAMP(3);
