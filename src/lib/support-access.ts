// Acesso da equipe Salutti à conta de um consultório (ver docs/ACESSO-SUPORTE.md).
// Há um único usuário "Suporte Salutti", sem Membership: ele "está" em todas as contas só por meio de uma concessão
// (SupportAccessGrant) gerada no backoffice. Cada concessão vale para um consultório, um login e 15 minutos,
// e a sessão do suporte termina junto com ela. O acesso é somente leitura e sem conteúdo clínico.
import crypto from "node:crypto";
import { db } from "./db";
import { recordAudit } from "./audit";

export const SUPPORT_USER_EMAIL = "suporte_salutti@salutti.com";
export const SUPPORT_ACCESS_MINUTES = 15;
// Papel virtual da sessão de suporte: fora de CLINICAL_ROLES e de qualquer papel de dono/administrador.
export const SUPPORT_ROLE = "support";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
// 20 caracteres de um alfabeto sem ambíguos (0/O, 1/l/I): ~115 bits, impossível de adivinhar em 15 minutos.
export const generateSupportPassword = (length = 20) =>
  Array.from(crypto.randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");

// A senha é aleatória e longa (não é escolhida por gente): SHA-256 basta, como nos convites, e permite achar a
// concessão por igualdade, sem comparar bcrypt contra várias.
const hashPassword = (password: string) => crypto.createHash("sha256").update(password).digest("hex");

// Preview e produção dividem o banco: uma senha gerada em produção não pode abrir um deploy de preview
// (que pode rodar código de outra branch).
export const supportLoginAllowedHere = () => process.env.VERCEL_ENV !== "preview";

export const isSupportEmail = (email: string) => email.trim().toLowerCase() === SUPPORT_USER_EMAIL;

export const grantIsLive = (g: { expiresAt: Date; revokedAt: Date | null; endedAt: Date | null }, now = new Date()) =>
  !g.revokedAt && !g.endedAt && g.expiresAt > now;

export const createSupportGrant = async (input: {
  workspaceId: string;
  backofficeUserId: string;
  reason: string;
  ticketId?: string | null;
}) => {
  // Uma concessão viva por consultório: gerar outra revoga a anterior.
  const live = await db.supportAccessGrant.findMany({
    where: { workspaceId: input.workspaceId, revokedAt: null, endedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  for (const g of live) await revokeSupportGrant(g.id);
  // A migration cria o usuário oculto; o upsert cobre bancos recriados por seed (desenvolvimento, e2e).
  await db.user.upsert({
    where: { email: SUPPORT_USER_EMAIL },
    update: {},
    create: { email: SUPPORT_USER_EMAIL, name: "Suporte Salutti", passwordHash: "!" },
  });
  const password = generateSupportPassword();
  const grant = await db.supportAccessGrant.create({
    data: {
      workspaceId: input.workspaceId,
      backofficeUserId: input.backofficeUserId,
      reason: input.reason,
      ticketId: input.ticketId ?? null,
      passwordHash: hashPassword(password),
      expiresAt: new Date(Date.now() + SUPPORT_ACCESS_MINUTES * 60 * 1000),
    },
  });
  return { grant, password };
};

// Login do usuário de suporte: a senha precisa ser de uma concessão viva e ainda não usada (uso único).
export const redeemSupportPassword = async (password: string) => {
  if (!supportLoginAllowedHere() || password.length > 100) return null;
  const g = await db.supportAccessGrant.findFirst({
    where: { passwordHash: hashPassword(password), usedAt: null, revokedAt: null, endedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!g) return null;
  // updateMany com usedAt: null: dois logins simultâneos com a mesma senha, só um vence.
  const { count } = await db.supportAccessGrant.updateMany({ where: { id: g.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) return null;
  await recordAudit({
    workspaceId: g.workspaceId,
    action: "support.access.start",
    entity: "SupportAccessGrant",
    entityId: g.id,
    metadata: { reason: g.reason, expiresAt: g.expiresAt.toISOString() },
  });
  return g;
};

export const getLiveGrant = async (grantId: string) => {
  const grant = await db.supportAccessGrant.findUnique({ where: { id: grantId }, include: { workspace: true } });
  return grant && grantIsLive(grant) ? grant : null;
};

// Revogar derruba a sessão na próxima requisição; se a senha já tinha sido usada, o fim fica no AuditLog do consultório.
export const revokeSupportGrant = async (grantId: string) => {
  const { count } = await db.supportAccessGrant.updateMany({ where: { id: grantId, revokedAt: null, endedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) return;
  const grant = await db.supportAccessGrant.findUnique({ where: { id: grantId } });
  if (grant?.usedAt) {
    await recordAudit({
      workspaceId: grant.workspaceId,
      action: "support.access.end",
      entity: "SupportAccessGrant",
      entityId: grant.id,
      metadata: { motivo: "revogado" },
    });
  }
};

export const endSupportGrant = async (grantId: string) => {
  const { count } = await db.supportAccessGrant.updateMany({ where: { id: grantId, endedAt: null }, data: { endedAt: new Date() } });
  if (count === 0) return;
  const grant = await db.supportAccessGrant.findUnique({ where: { id: grantId } });
  if (grant) {
    await recordAudit({ workspaceId: grant.workspaceId, action: "support.access.end", entity: "SupportAccessGrant", entityId: grant.id });
  }
};
