-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showPatientBirthdays" BOOLEAN NOT NULL DEFAULT true;

-- Contas classificadas só pela área de atendimento: quem já trabalha em equipe (mais de um profissional
-- ativo ou mais de um usuário) é clínica, senão ficaria travado pelo limite do autônomo.
UPDATE "Workspace" w SET "accountType" = 'clinica'
WHERE w."accountType" = 'autonomo'
  AND (
    (SELECT COUNT(*) FROM "Professional" p WHERE p."workspaceId" = w."id" AND p."active") > 1
    OR (SELECT COUNT(*) FROM "Membership" m WHERE m."workspaceId" = w."id") > 1
  );
