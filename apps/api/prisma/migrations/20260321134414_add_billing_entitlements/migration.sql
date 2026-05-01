-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EntitlementOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "features" TEXT,
    "featureAdditions" TEXT,
    "maxProjects" INTEGER,
    "maxSeatsPerProject" INTEGER,
    "maxKeysPerProject" INTEGER,
    "maxLocalesPerProject" INTEGER,
    "maxMonthlyApiCalls" INTEGER,
    "note" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LicenseState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'none',
    "licensee" TEXT,
    "planId" TEXT,
    "seats" INTEGER,
    "features" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" DATETIME,
    "graceEndsAt" DATETIME,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementOverride_orgId_key" ON "EntitlementOverride"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseState_orgId_key" ON "LicenseState"("orgId");
