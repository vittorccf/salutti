-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "backofficeUserId" TEXT,
    "ticketId" TEXT,
    "reason" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAccessGrant_expiresAt_idx" ON "SupportAccessGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_workspaceId_createdAt_idx" ON "SupportAccessGrant"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAccessGrant" ADD CONSTRAINT "SupportAccessGrant_backofficeUserId_fkey" FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Usuário oculto "Suporte Salutti": sem consultório (Membership) e sem senha própria utilizável.
-- Só entra com a senha de uma concessão vigente (SupportAccessGrant).
INSERT INTO "User" ("id", "email", "name", "passwordHash") VALUES
  ('suporte_salutti', 'suporte_salutti@salutti.com', 'Suporte Salutti', '!')
ON CONFLICT ("email") DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "SupportAccessGrant_passwordHash_key" ON "SupportAccessGrant"("passwordHash");
