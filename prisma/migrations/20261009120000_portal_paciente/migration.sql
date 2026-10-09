-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "patientResponse" TEXT,
ADD COLUMN     "patientResponseAt" TIMESTAMP(3),
ADD COLUMN     "patientResponseNote" TEXT;

-- AlterTable
ALTER TABLE "PatientPortalAccess" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "cpfDigits" TEXT,
ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "messagesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "portalMessageNotice" TEXT;

-- CreateTable
CREATE TABLE "PortalMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fromPatient" BOOLEAN NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalHighlight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "patientNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalMessage_workspaceId_patientId_createdAt_idx" ON "PortalMessage"("workspaceId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalMessage_workspaceId_fromPatient_readAt_idx" ON "PortalMessage"("workspaceId", "fromPatient", "readAt");

-- CreateIndex
CREATE INDEX "PortalHighlight_workspaceId_patientId_createdAt_idx" ON "PortalHighlight"("workspaceId", "patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientPortalAccess_inviteTokenHash_key" ON "PatientPortalAccess"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "PatientPortalAccess_cpfDigits_idx" ON "PatientPortalAccess"("cpfDigits");

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMessage" ADD CONSTRAINT "PortalMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalHighlight" ADD CONSTRAINT "PortalHighlight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalHighlight" ADD CONSTRAINT "PortalHighlight_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

