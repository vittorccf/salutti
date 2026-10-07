-- AlterTable
ALTER TABLE "PlatformPlan" ADD COLUMN "stripePriceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_stripePriceId_key" ON "PlatformPlan"("stripePriceId");
