-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "taxCpf" TEXT,
ADD COLUMN     "taxDependents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxOccupation" TEXT,
ADD COLUMN     "taxRegime" TEXT NOT NULL DEFAULT 'pf';

-- Consultório que já tem CNPJ continua emitindo NFS-e (regime de empresa); o dono ajusta no perfil fiscal.
UPDATE "Workspace" SET "taxRegime" = 'simples' WHERE "cnpj" IS NOT NULL AND "cnpj" <> '';

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "responsibleCpf" TEXT;
