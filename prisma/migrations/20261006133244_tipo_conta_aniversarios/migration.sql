-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "accountType" TEXT NOT NULL DEFAULT 'autonomo';

-- Contas existentes: clínica e UBS viram conta de clínica; o resto, profissional autônomo.
UPDATE "Workspace" SET "accountType" = 'clinica' WHERE "segment" IN ('clinica', 'ubs');
