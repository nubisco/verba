-- Accounts: the tenant level above projects (fleet standard, "Every rail has
-- the same anatomy" in the workspace AGENTS.md).
--
-- The Organization and OrgMembership tables become Account and AccountMember.
-- They are renamed rather than recreated, so a row written while the old
-- ENABLE_ORGANIZATIONS flag was on survives. Every project and every person
-- that already exists goes into one account, "Nubisco", so nothing changes for
-- anyone signed in today. A database with no users and no projects (a fresh
-- install) gets no account here: setup creates the first one.

-- ── Rename the tables, their keys and their constraints ─────────────────────
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_orgId_fkey";
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_userId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT "Project_organizationId_fkey";

ALTER TABLE "Organization" RENAME TO "Account";
ALTER TABLE "Account" RENAME CONSTRAINT "Organization_pkey" TO "Account_pkey";
ALTER INDEX "Organization_slug_key" RENAME TO "Account_slug_key";

ALTER TABLE "OrgMembership" RENAME TO "AccountMember";
ALTER TABLE "AccountMember" RENAME CONSTRAINT "OrgMembership_pkey" TO "AccountMember_pkey";
ALTER TABLE "AccountMember" RENAME COLUMN "orgId" TO "accountId";
ALTER INDEX "OrgMembership_userId_orgId_key" RENAME TO "AccountMember_userId_accountId_key";
CREATE INDEX "AccountMember_accountId_idx" ON "AccountMember"("accountId");

ALTER TABLE "Project" RENAME COLUMN "organizationId" TO "accountId";

-- The app-level `role` claim from Platform, refreshed at sign-in.
ALTER TABLE "User" ADD COLUMN "platformRole" TEXT;

-- ── The default account, when there is anything to put in it ────────────────
INSERT INTO "Account" ("id", "name", "slug", "createdAt")
SELECT 'acc_default', 'Nubisco', 'nubisco', CURRENT_TIMESTAMP
WHERE (EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Project"))
  AND NOT EXISTS (SELECT 1 FROM "Account" WHERE "slug" = 'nubisco');

UPDATE "Project" SET "accountId" = (SELECT "id" FROM "Account" WHERE "slug" = 'nubisco')
WHERE "accountId" IS NULL;

-- Everyone joins it. Instance operators (the cached VERBA_OPERATORS flag) own
-- it. Project admins become account admins, so they can still add people to
-- their projects as they could before. Everyone else is a member.
INSERT INTO "AccountMember" ("id", "userId", "accountId", "role", "createdAt")
SELECT
  'accm_' || u."id",
  u."id",
  a."id",
  CASE
    WHEN u."isGlobalAdmin" THEN 'OWNER'
    WHEN EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = u."id" AND m."role" = 'ADMIN') THEN 'ADMIN'
    ELSE 'MEMBER'
  END,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN "Account" a
WHERE a."slug" = 'nubisco'
  AND NOT EXISTS (SELECT 1 FROM "AccountMember" x WHERE x."userId" = u."id" AND x."accountId" = a."id");

-- An account always keeps an owner. With no operator flagged, the earliest
-- account admin owns it, or failing that the earliest member.
UPDATE "AccountMember" SET "role" = 'OWNER'
WHERE "id" = (
  SELECT am."id" FROM "AccountMember" am
  JOIN "User" u ON u."id" = am."userId"
  WHERE am."accountId" = (SELECT "id" FROM "Account" WHERE "slug" = 'nubisco')
  ORDER BY CASE am."role" WHEN 'ADMIN' THEN 0 ELSE 1 END, u."createdAt", u."id"
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "AccountMember"
  WHERE "accountId" = (SELECT "id" FROM "Account" WHERE "slug" = 'nubisco') AND "role" = 'OWNER'
);

-- ── Every project belongs to an account from now on ────────────────────────
ALTER TABLE "Project" ALTER COLUMN "accountId" SET NOT NULL;
CREATE INDEX "Project_accountId_idx" ON "Project"("accountId");

ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
