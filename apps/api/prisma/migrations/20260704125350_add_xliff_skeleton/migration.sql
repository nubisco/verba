-- CreateTable
CREATE TABLE "XliffSkeleton" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.2',
    "document" TEXT NOT NULL,
    "originals" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XliffSkeleton_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "XliffSkeleton_projectId_targetLanguage_key" ON "XliffSkeleton"("projectId", "targetLanguage");
