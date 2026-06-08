-- CreateTable
CREATE TABLE "PlatformIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleKey" TEXT NOT NULL,
    "platformSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PlatformIdentity_bundleKey_idx" ON "PlatformIdentity"("bundleKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformIdentity_bundleKey_platformSub_key" ON "PlatformIdentity"("bundleKey", "platformSub");
