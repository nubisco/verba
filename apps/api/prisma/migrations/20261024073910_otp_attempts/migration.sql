-- AlterTable
ALTER TABLE "OtpToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;


-- Codes are stored hashed from this release on. Burn any code issued before it,
-- which was stored in plain text (they expire within 15 minutes anyway).
UPDATE "OtpToken" SET "used" = true WHERE "used" = false;
