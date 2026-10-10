-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "waitlistEstimate" TEXT,
ADD COLUMN     "waitlistIntro" TEXT,
ADD COLUMN     "waitlistPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitlistSlug" TEXT;

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "reason" TEXT,
    "modality" TEXT NOT NULL DEFAULT 'indiferente',
    "preferredDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredShifts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "professionalId" TEXT,
    "priceNote" TEXT,
    "source" TEXT NOT NULL DEFAULT 'outro',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "notes" TEXT,
    "contactAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedPatientId" TEXT,
    "createdVia" TEXT NOT NULL DEFAULT 'manual',
    "consentAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_workspaceId_status_createdAt_idx" ON "WaitlistEntry"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_waitlistSlug_key" ON "Workspace"("waitlistSlug");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

