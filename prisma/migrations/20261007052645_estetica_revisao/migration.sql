-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_productId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "procedureAdverseEvent" TEXT,
ADD COLUMN     "procedureDetails" TEXT,
ADD COLUMN     "procedureRecordedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClinicalPhoto" ADD COLUMN     "marketingRevokedAt" TIMESTAMP(3),
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedReason" TEXT;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sessões já registradas antes desta migration ficam marcadas (impede segundo registro).
UPDATE "Appointment" a SET "procedureRecordedAt" = m.first
FROM (SELECT "appointmentId", MIN("createdAt") AS first FROM "StockMovement" WHERE kind = 'uso' AND "appointmentId" IS NOT NULL GROUP BY "appointmentId") m
WHERE a.id = m."appointmentId";
