// Acesso da equipe Salutti à conta de um consultório (ver docs/ACESSO-SUPORTE.md).
// Há um único usuário "Suporte Salutti", sem Membership: ele "está" em todas as contas só por meio de uma concessão
// (SupportAccessGrant) gerada no backoffice. Cada concessão vale para um consultório, um login e 15 minutos,
// e a sessão do suporte termina junto com ela. O acesso é somente leitura e sem conteúdo clínico.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
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

export const isSupportEmail = (email: string) => email.trim().toLowerCase() === SUPPORT_USER_EMAIL;

export const grantIsLive = (g: { expiresAt: Date; revokedAt: Date | null; endedAt: Date | null }, now = new Date()) =>
  !g.revokedAt && !g.endedAt && g.expiresAt > now;

export const createSupportGrant = async (input: {
  workspaceId: string;
  backofficeUserId: string;
  reason: string;
  ticketId?: string | null;
}) => {
  // Uma concessão viva por consultório: gerar outra encerra a anterior.
  await db.supportAccessGrant.updateMany({
    where: { workspaceId: input.workspaceId, revokedAt: null, endedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });
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
      passwordHash: await bcrypt.hash(password, 10),
      expiresAt: new Date(Date.now() + SUPPORT_ACCESS_MINUTES * 60 * 1000),
    },
  });
  return { grant, password };
};

// Login do usuário de suporte: a senha precisa ser de uma concessão viva e ainda não usada (uso único).
export const redeemSupportPassword = async (password: string) => {
  const candidates = await db.supportAccessGrant.findMany({
    where: { usedAt: null, revokedAt: null, endedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const g of candidates) {
    if (await bcrypt.compare(password, g.passwordHash)) {
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
    }
  }
  return null;
};

export const getLiveGrant = async (grantId: string) => {
  const grant = await db.supportAccessGrant.findUnique({ where: { id: grantId }, include: { workspace: true } });
  return grant && grantIsLive(grant) ? grant : null;
};

export const endSupportGrant = async (grantId: string) => {
  const { count } = await db.supportAccessGrant.updateMany({ where: { id: grantId, endedAt: null }, data: { endedAt: new Date() } });
  if (count === 0) return;
  const grant = await db.supportAccessGrant.findUnique({ where: { id: grantId } });
  if (grant) {
    await recordAudit({ workspaceId: grant.workspaceId, action: "support.access.end", entity: "SupportAccessGrant", entityId: grant.id });
  }
};
