-- CreateTable
CREATE TABLE "BackofficeUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'suporte',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "interval" TEXT NOT NULL DEFAULT 'mensal',
    "trialDays" INTEGER,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'bug',
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "viewport" TEXT,
    "appVersion" TEXT,
    "locale" TEXT,
    "metadata" JSONB,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadByStaff" BOOLEAN NOT NULL DEFAULT true,
    "unreadByClient" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "userId" TEXT,
    "backofficeUserId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackofficeAuditLog" (
    "id" TEXT NOT NULL,
    "backofficeUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackofficeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BackofficeUser_username_key" ON "BackofficeUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPlan_code_key" ON "PlatformPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_status_lastActivityAt_idx" ON "SupportTicket"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "SupportTicket_workspaceId_idx" ON "SupportTicket"("workspaceId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "BackofficeAuditLog_createdAt_idx" ON "BackofficeAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_backofficeUserId_fkey" FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackofficeAuditLog" ADD CONSTRAINT "BackofficeAuditLog_backofficeUserId_fkey" FOREIGN KEY ("backofficeUserId") REFERENCES "BackofficeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Planos da plataforma (editáveis depois no backoffice).
INSERT INTO "PlatformPlan" ("id", "code", "name", "priceCents", "interval", "trialDays", "description", "sortOrder", "updatedAt") VALUES
  ('plan_trial', 'trial', 'Teste grátis', 0, 'trial', 15, 'Teste grátis por 15 dias', 0, CURRENT_TIMESTAMP),
  ('plan_basico', 'basico', 'Básico', 4990, 'mensal', NULL, 'Plano mensal Básico', 1, CURRENT_TIMESTAMP),
  ('plan_essencial', 'essencial', 'Essencial', 8990, 'mensal', NULL, 'Plano mensal Essencial', 2, CURRENT_TIMESTAMP),
  ('plan_anual', 'anual', 'Anual', 74990, 'anual', NULL, 'Plano anual', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Acesso inicial ao backoffice: usuário admin, senha combinada com o dono (só o hash fica aqui); troca obrigatória no primeiro login.
INSERT INTO "BackofficeUser" ("id", "username", "name", "passwordHash", "role", "mustChangePassword") VALUES
  ('bo_admin', 'admin', 'Administrador', '$2a$10$KZojx0qB0GhvqAuTYqW1RuhpwYHGshfqovaCHBDPymSY0biP/YIxC', 'admin', true)
ON CONFLICT ("username") DO NOTHING;
