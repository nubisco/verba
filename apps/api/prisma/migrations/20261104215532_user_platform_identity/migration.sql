-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformIssuer" TEXT,
ADD COLUMN     "platformSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_platformIssuer_platformSub_key" ON "User"("platformIssuer", "platformSub");

