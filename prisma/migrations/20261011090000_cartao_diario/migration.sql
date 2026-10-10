-- AlterTable
ALTER TABLE "DailyCard" ADD COLUMN     "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "answers" JSONB,
ADD COLUMN     "emotions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "energy" INTEGER;

-- CreateTable
CREATE TABLE "DiaryConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "template" TEXT NOT NULL DEFAULT 'basico',
    "items" TEXT[],
    "questions" JSONB NOT NULL DEFAULT '[]',
    "instruments" TEXT[],
    "instrumentEveryDays" INTEGER NOT NULL DEFAULT 14,
    "patientConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentResponse" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "answers" INTEGER[],
    "score" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiaryConfig_patientId_key" ON "DiaryConfig"("patientId");

-- CreateIndex
CREATE INDEX "InstrumentResponse_patientId_instrument_createdAt_idx" ON "InstrumentResponse"("patientId", "instrument", "createdAt");

-- CreateIndex
CREATE INDEX "InstrumentResponse_workspaceId_riskFlag_reviewedAt_idx" ON "InstrumentResponse"("workspaceId", "riskFlag", "reviewedAt");

-- AddForeignKey
ALTER TABLE "DiaryConfig" ADD CONSTRAINT "DiaryConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryConfig" ADD CONSTRAINT "DiaryConfig_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentResponse" ADD CONSTRAINT "InstrumentResponse_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentResponse" ADD CONSTRAINT "InstrumentResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

