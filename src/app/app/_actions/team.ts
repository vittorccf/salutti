"use server";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { appOrigin } from "@/lib/app-url";
import { emailSchema } from "@/lib/email";
import { createInvitation, isInviteRole, rolesFor } from "@/lib/invitations";
import type { FormResult } from "@/components/forms/action-form";
import { APP_PERMISSIONS, appDiffFromRole, appGrantProblem, effectiveAppPermissions, isAppPermission, type AppPermission } from "@/lib/app-permissions";

// Gestão de acessos: só dono ou administrador. O dono não pode ser removido nem rebaixado por aqui.
async function managerContext() {
  const ctx = await requireContext();
  if (!ctx.permissions.has("equipe.gerenciar")) return null;
  return ctx;
}

const origin = appOrigin;

export async function inviteMemberAction(_prev: FormResult, formData: FormData): Promise<FormResult & { link?: string }> {
  const t = await getTranslations("settings.access");
  const ctx = await managerContext();
  if (!ctx) return { erro: t("errors.noPermission") };
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { erro: t("errors.email") };
  const role = formData.get("role");
  if (!isInviteRole(role) || !rolesFor(ctx.workspace.accountType).includes(role)) return { erro: t("errors.role") };
  // Só o dono convida administradores.
  if (role === "admin" && ctx.role !== "owner") return { erro: t("errors.adminOnlyOwner") };
  const already = await db.membership.findFirst({ where: { workspaceId: ctx.workspace.id, user: { email: email.data } } });
  if (already) return { erro: t("errors.alreadyMember") };

  const { invitation, token } = await createInvitation({
    workspaceId: ctx.workspace.id,
    email: email.data,
    role,
    invitedById: ctx.user.id,
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "team.invite",
    entity: "Invitation",
    entityId: invitation.id,
    metadata: { role },
  });
  revalidatePath("/app/equipe");
  return { ok: t("inviteCreated"), link: `${origin()}/convite/${token}` };
}

export async function revokeInviteAction(formData: FormData) {
  const ctx = await managerContext();
  if (!ctx) return;
  const id = String(formData.get("invitationId"));
  await db.invitation.updateMany({ where: { id, workspaceId: ctx.workspace.id, acceptedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "team.invite_revoke", entity: "Invitation", entityId: id });
  revalidatePath("/app/equipe");
}

export async function changeRoleAction(formData: FormData) {
  const ctx = await managerContext();
  if (!ctx) return;
  const membershipId = String(formData.get("membershipId"));
  const role = formData.get("role");
  if (!isInviteRole(role) || !rolesFor(ctx.workspace.accountType).includes(role)) return;
  if (role === "admin" && ctx.role !== "owner") return;
  const m = await db.membership.findFirst({ where: { id: membershipId, workspaceId: ctx.workspace.id } });
  if (!m || m.role === "owner" || m.userId === ctx.user.id) return;
  await db.membership.update({ where: { id: m.id }, data: { role, permsGranted: [], permsDenied: [] } });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "team.role",
    entity: "Membership",
    entityId: m.id,
    metadata: { from: m.role, to: role },
  });
  revalidatePath("/app/equipe");
}

export async function removeMemberAction(formData: FormData) {
  const ctx = await managerContext();
  if (!ctx) return;
  const membershipId = String(formData.get("membershipId"));
  const m = await db.membership.findFirst({ where: { id: membershipId, workspaceId: ctx.workspace.id } });
  // Dono não sai por aqui; administrador não remove outro administrador; ninguém remove a si mesmo.
  if (!m || m.role === "owner" || m.userId === ctx.user.id || (m.role === "admin" && ctx.role !== "owner")) return;
  await db.membership.delete({ where: { id: m.id } });
  // O cadastro profissional vinculado perde o vínculo (o Meet deixa de usar a conta dessa pessoa).
  await db.professional.updateMany({ where: { workspaceId: ctx.workspace.id, userId: m.userId }, data: { userId: null } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "team.remove", entity: "Membership", entityId: m.id });
  revalidatePath("/app/equipe");
}

// Permissões de um membro (dono ou administrador). Grava só o que difere do padrão do papel. Regras: ninguém edita
// a si mesmo nem o dono; administrador não edita outro administrador; só concede ou retira o que tem; conteúdo
// clínico nunca vai para recepção ou financeiro (regra fixa em app-permissions.ts).
export async function saveMemberPermissionsAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const t = await getTranslations("settings.access");
  const ctx = await managerContext();
  if (!ctx) return { erro: t("errors.noPermission") };
  const m = await db.membership.findFirst({ where: { id: String(formData.get("membershipId")), workspaceId: ctx.workspace.id } });
  if (!m) return { erro: t("errors.noPermission") };
  const desired = new Set<AppPermission>(formData.getAll("perm").map(String).filter(isAppPermission));
  const before = effectiveAppPermissions(m.role, m.permsGranted, m.permsDenied);
  const problem = appGrantProblem({ role: ctx.role, userId: ctx.user.id, perms: ctx.permissions }, { role: m.role, userId: m.userId }, before, desired);
  if (problem) return { erro: t(`permissions.errors.${problem}`) };
  const diff = appDiffFromRole(m.role, desired);
  await db.membership.update({ where: { id: m.id }, data: diff });
  const after = effectiveAppPermissions(m.role, diff.permsGranted, diff.permsDenied);
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "team.permissions",
    entity: "Membership",
    entityId: m.id,
    metadata: {
      added: APP_PERMISSIONS.filter((p) => after.has(p) && !before.has(p)),
      removed: APP_PERMISSIONS.filter((p) => before.has(p) && !after.has(p)),
    },
  });
  revalidatePath("/app/equipe");
  return { ok: t("permissions.saved") };
}
