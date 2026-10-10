-- AlterTable
ALTER TABLE "DailyCard" ADD COLUMN     "medication" BOOLEAN;

-- AlterTable
ALTER TABLE "DiaryConfig" ADD COLUMN     "riskProtocolAckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstrumentResponse" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedById" TEXT;

