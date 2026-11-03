-- AlterTable
ALTER TABLE "ImportRun" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'import',
ADD COLUMN     "processedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRows" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ImportChunk" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL DEFAULT '[]',
    "stats" TEXT NOT NULL DEFAULT '{}',
    "errors" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportChunk_importRunId_status_idx" ON "ImportChunk"("importRunId", "status");

-- AddForeignKey
ALTER TABLE "ImportChunk" ADD CONSTRAINT "ImportChunk_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

