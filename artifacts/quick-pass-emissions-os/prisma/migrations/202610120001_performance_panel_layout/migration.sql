CREATE TABLE "PerformancePanelLayout" (
    "userId" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PerformancePanelLayout_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "PerformancePanelLayout"
ADD CONSTRAINT "PerformancePanelLayout_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
