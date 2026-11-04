-- CreateTable
CREATE TABLE "ImportChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importRunId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL DEFAULT '[]',
    "stats" TEXT NOT NULL DEFAULT '{}',
    "errors" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportChunk_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (added columns, so no table rebuild)
ALTER TABLE "ImportRun" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'import';
ALTER TABLE "ImportRun" ADD COLUMN "totalRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportRun" ADD COLUMN "processedRows" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ImportChunk_importRunId_status_idx" ON "ImportChunk"("importRunId", "status");

