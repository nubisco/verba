-- Hosted plans from Nubisco's licenses service (packages/ee/src/plans): the
-- local copy of each account's entitlement. A new table only, nothing changed
-- or dropped. The old Subscription table (Stripe, never connected) stays as it
-- is and is no longer read.

-- CreateTable
CREATE TABLE "AccountPlan" (
    "accountId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "limits" TEXT NOT NULL DEFAULT '{}',
    "subscription" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "graceUntil" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPlan_pkey" PRIMARY KEY ("accountId")
);

-- AddForeignKey
ALTER TABLE "AccountPlan" ADD CONSTRAINT "AccountPlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

