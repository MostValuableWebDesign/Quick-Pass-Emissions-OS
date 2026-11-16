ALTER TABLE "DealerVirUpload" ADD COLUMN "fileCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DealerVirUpload" ADD COLUMN "expectedPages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DealerVirUpload" ADD COLUMN "processedPages" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "DealerVirChunk" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "chunkKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealerVirChunk_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealerVirChunk_uploadId_chunkKey_key" ON "DealerVirChunk"("uploadId", "chunkKey");
CREATE UNIQUE INDEX "DealerVirChunk_uploadId_sequence_key" ON "DealerVirChunk"("uploadId", "sequence");
ALTER TABLE "DealerVirChunk" ADD CONSTRAINT "DealerVirChunk_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "DealerVirUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
