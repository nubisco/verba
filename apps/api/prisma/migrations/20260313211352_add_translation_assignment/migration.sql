-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyId" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "assignedToId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Translation_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "Key" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Translation_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "Locale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Translation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Translation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Translation" ("id", "keyId", "localeId", "status", "text", "updatedAt", "updatedById", "version") SELECT "id", "keyId", "localeId", "status", "text", "updatedAt", "updatedById", "version" FROM "Translation";
DROP TABLE "Translation";
ALTER TABLE "new_Translation" RENAME TO "Translation";
CREATE UNIQUE INDEX "Translation_keyId_localeId_key" ON "Translation"("keyId", "localeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
