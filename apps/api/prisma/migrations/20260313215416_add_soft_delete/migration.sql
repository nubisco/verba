-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Key" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Translation" ADD COLUMN "deletedAt" DATETIME;
