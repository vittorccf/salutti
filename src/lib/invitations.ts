// Convites para a equipe. O link leva um token aleatório; o banco guarda só o hash (SHA-256), então quem
// lê o banco não consegue usar um convite. Vale 7 dias, uma vez, e só para o e-mail convidado.
import crypto from "node:crypto";
import { isSupportEmail } from "./support-access";
import { db } from "./db";

export const INVITE_ROLES = ["admin", "professional", "financial", "receptionist"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const isInviteRole = (v: unknown): v is InviteRole => (INVITE_ROLES as readonly unknown[]).includes(v);

// Conta de autônomo tem um profissional: pode convidar só recepção e financeiro.
export const rolesFor = (accountType: string): readonly InviteRole[] =>
  accountType === "clinica" ? INVITE_ROLES : (["financial", "receptionist"] as const);

const INVITE_DAYS = 7;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createInvitation(input: { workspaceId: string; email: string; role: InviteRole; invitedById: string }) {
  const token = crypto.randomBytes(24).toString("base64url");
  // Um convite pendente por e-mail e consultório: o novo substitui o anterior.
  await db.invitation.updateMany({
    where: { workspaceId: input.workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const invitation = await db.invitation.create({
    data: { ...input, tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  });
  return { invitation, token };
}

// Convite válido (não usado, não revogado, no prazo) a partir do token do link.
export async function findInvitation(token: string) {
  if (!token || token.length > 100) return null;
  const inv = await db.invitation.findUnique({ where: { tokenHash: hash(token) }, include: { workspace: true } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

// Entra na equipe: cria (ou atualiza) o vínculo com o papel do convite e marca o convite como usado.
export async function acceptInvitation(invitationId: string, userId: string) {
  return db.$transaction(async (tx) => {
    // O usuário oculto do suporte nunca vira membro: o acesso dele é só por concessão do backoffice.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user || isSupportEmail(user.email)) throw new Error("Convite inválido para este usuário.");
    const inv = await tx.invitation.update({ where: { id: invitationId }, data: { acceptedAt: new Date() } });
    const existing = await tx.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: inv.workspaceId } } });
    // Quem já é membro não perde papel maior (ex.: dono convidado de novo continua dono).
    if (!existing) await tx.membership.create({ data: { userId, workspaceId: inv.workspaceId, role: inv.role } });
    else if (existing.role !== "owner") await tx.membership.update({ where: { id: existing.id }, data: { role: inv.role } });
    return inv;
  });
}
