-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "installment" INTEGER,
ADD COLUMN     "treatmentPlanId" TEXT;

-- CreateTable
CREATE TABLE "DentalProcedure" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT 'dentistica',
    "tussCode" TEXT,
    "price" DOUBLE PRECISION,
    "perTooth" BOOLEAN NOT NULL DEFAULT true,
    "toothResult" TEXT,
    "returnMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DentalProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToothRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "tooth" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "faces" TEXT,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToothRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'em_estudo',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "firstDueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "procedureId" TEXT,
    "name" TEXT NOT NULL,
    "tussCode" TEXT,
    "tooth" INTEGER,
    "faces" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "toothResult" TEXT,
    "returnMonths" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planejado',
    "doneAt" TIMESTAMP(3),
    "professionalId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "lab" TEXT NOT NULL,
    "work" TEXT NOT NULL,
    "teeth" TEXT,
    "shade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cost" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "planId" TEXT,
    "contactedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DentalProcedure_workspaceId_active_idx" ON "DentalProcedure"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "ToothRecord_workspaceId_idx" ON "ToothRecord"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ToothRecord_patientId_tooth_key" ON "ToothRecord"("patientId", "tooth");

-- CreateIndex
CREATE INDEX "TreatmentPlan_workspaceId_status_idx" ON "TreatmentPlan"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TreatmentPlan_patientId_idx" ON "TreatmentPlan"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_workspaceId_number_key" ON "TreatmentPlan"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "TreatmentItem_planId_idx" ON "TreatmentItem"("planId");

-- CreateIndex
CREATE INDEX "LabOrder_workspaceId_status_idx" ON "LabOrder"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Recall_workspaceId_status_dueDate_idx" ON "Recall"("workspaceId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DentalProcedure" ADD CONSTRAINT "DentalProcedure_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToothRecord" ADD CONSTRAINT "ToothRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "DentalProcedure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recall" ADD CONSTRAINT "Recall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recall" ADD CONSTRAINT "Recall_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "Charge_treatmentPlanId_idx" ON "Charge"("treatmentPlanId");
