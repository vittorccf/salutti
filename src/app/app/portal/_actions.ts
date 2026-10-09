"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { appOrigin } from "@/lib/app-url";
import { cpfDigits } from "@/lib/cpf";
import { requirePortalModule } from "@/lib/permissions";
import { parseDateOnly } from "@/lib/dates";
import { HIGHLIGHT_KINDS, MESSAGE_MAX, portalPatientScope, safeUrl } from "@/lib/portal";
import { clearThrottle, hashInviteToken, INVITE_HOURS, newInviteToken, throttleKeys } from "@/lib/portal-auth";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Paciente do consultório ativo (e não excluído) que esta pessoa pode ver. Mensagens e tarefas são conteúdo
// clínico: só papéis clínicos; na clínica, o profissional só vê os pacientes que atende.
async function ownedPatient(patientId: string) {
  const ctx = await requirePortalModule();
  const patient = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null, ...portalPatientScope(ctx) },
    include: { portalAccess: true },
  });
  return { ctx, patient };
}

const paths = (patientId: string) => {
  revalidatePath(`/app/pacientes/${patientId}/portal`);
  revalidatePath("/app/portal");
};

export type InviteResult = { erro?: string; link?: string; expiresAt?: string } | null;

// Convite de uso único (72h). Exige data de nascimento ou CPF no cadastro: é o que o paciente confirma ao abrir
// (sem isso, quem tivesse o link escolheria o login). Paciente que já tem senha: o convite cria uma nova.
export async function createInviteAction(_prev: InviteResult, fd: FormData): Promise<InviteResult> {
  const { ctx, patient } = await ownedPatient(str(fd, "patientId"));
  const t = await getTranslations("portal.pro.errors");
  if (!patient) return { erro: t("patientNotFound") };
  if (!patient.birthDate && !cpfDigits(patient.cpf)) return { erro: t("needIdentity") };
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000);
  const access = await db.patientPortalAccess.upsert({
    where: { patientId: patient.id },
    create: { patientId: patient.id, token: newInviteToken(), inviteTokenHash: hashInviteToken(token), inviteExpiresAt: expiresAt },
    update: { active: true, inviteTokenHash: hashInviteToken(token), inviteExpiresAt: expiresAt },
  });
  // Convite novo destrava as tentativas erradas da ativação.
  await clearThrottle(throttleKeys.access(access.id));
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: patient.portalAccess?.activatedAt ? "portal.reset-invite" : "portal.invite",
    entity: "Patient",
    entityId: patient.id,
  });
  paths(patient.id);
  return { link: `${appOrigin()}/portal/convite/${token}`, expiresAt: expiresAt.toISOString() };
}

// Revogar: o portal deixa de abrir e as sessões caem. A senha e o login saem: para voltar, o paciente usa um
// convite novo e cria outra senha (a antiga não ressuscita).
export async function revokePortalAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await ownedPatient(str(fd, "patientId"));
  const t = await getTranslations("portal.pro");
  if (!patient?.portalAccess) return { erro: t("errors.patientNotFound") };
  await db.patientPortalAccess.update({
    where: { id: patient.portalAccess.id },
    data: {
      active: false,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      passwordHash: null,
      activatedAt: null,
      cpfDigits: null,
      sessionVersion: { increment: 1 },
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "portal.revoke", entity: "Patient", entityId: patient.id });
  paths(patient.id);
  return { ok: t("revoked") };
}

export async function setMessagesAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await ownedPatient(str(fd, "patientId"));
  const t = await getTranslations("portal.pro");
  if (!patient?.portalAccess) return { erro: t("errors.patientNotFound") };
  const enabled = fd.get("enabled") === "on";
  await db.patientPortalAccess.update({ where: { id: patient.portalAccess.id }, data: { messagesEnabled: enabled } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: enabled ? "portal.messages-on" : "portal.messages-off", entity: "Patient", entityId: patient.id });
  paths(patient.id);
  return { ok: enabled ? t("messagesOn") : t("messagesOff") };
}

export async function replyMessageAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await ownedPatient(str(fd, "patientId"));
  const t = await getTranslations("portal.pro");
  if (!patient) return { erro: t("errors.patientNotFound") };
  const body = str(fd, "body");
  if (!body) return { erro: t("errors.messageEmpty") };
  if (body.length > MESSAGE_MAX) return { erro: t("errors.messageLong", { max: MESSAGE_MAX }) };
  await db.portalMessage.create({ data: { workspaceId: ctx.workspace.id, patientId: patient.id, fromPatient: false, authorUserId: ctx.user.id, body } });
  paths(patient.id);
  return { ok: t("sent") };
}

export async function addHighlightAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await ownedPatient(str(fd, "patientId"));
  const t = await getTranslations("portal.pro");
  if (!patient) return { erro: t("errors.patientNotFound") };
  const kind = str(fd, "kind");
  const title = str(fd, "title");
  if (!(HIGHLIGHT_KINDS as readonly string[]).includes(kind)) return { erro: t("errors.kindInvalid") };
  if (title.length < 2 || title.length > 120) return { erro: t("errors.titleRequired") };
  const urlRaw = str(fd, "url");
  const url = urlRaw ? safeUrl(urlRaw) : null;
  if (urlRaw && !url) return { erro: t("errors.urlInvalid") };
  const due = str(fd, "dueDate");
  if (due && !isDateKey(due)) return { erro: t("errors.dueInvalid") };
  await db.portalHighlight.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: patient.id,
      authorUserId: ctx.user.id,
      kind,
      title,
      body: str(fd, "body").slice(0, 2000) || null,
      url,
      dueDate: due ? parseDateOnly(due) : null,
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "portal.highlight", entity: "Patient", entityId: patient.id, metadata: { kind } });
  paths(patient.id);
  return { ok: t("highlightAdded") };
}

export async function archiveHighlightAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePortalModule();
  const t = await getTranslations("portal.pro");
  const h = await db.portalHighlight.findFirst({
    where: { id: str(fd, "highlightId"), workspaceId: ctx.workspace.id, patient: portalPatientScope(ctx) },
  });
  if (!h) return { erro: t("errors.patientNotFound") };
  await db.portalHighlight.update({ where: { id: h.id }, data: { archivedAt: h.archivedAt ? null : new Date() } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: h.archivedAt ? "portal.highlight-restore" : "portal.highlight-archive", entity: "Patient", entityId: h.patientId });
  paths(h.patientId);
  return { ok: h.archivedAt ? t("highlightRestored") : t("highlightArchived") };
}

// Pedido de remarcação tratado (sessão remarcada ou combinado com o paciente): sai das pendências.
export async function clearResponseAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePortalModule();
  const t = await getTranslations("portal.pro");
  const appointmentId = str(fd, "appointmentId");
  const res = await db.appointment.updateMany({
    where: { id: appointmentId, workspaceId: ctx.workspace.id, patientResponse: "reschedule", patient: portalPatientScope(ctx) },
    data: { patientResponse: null, patientResponseAt: null, patientResponseNote: null },
  });
  if (!res.count) return { erro: t("errors.patientNotFound") };
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "portal.reschedule-handled", entity: "Appointment", entityId: appointmentId });
  revalidatePath("/app/portal");
  revalidatePath("/app/agenda");
  return { ok: t("responseCleared") };
}

export async function saveNoticeAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePortalModule();
  const t = await getTranslations("portal.pro");
  if (ctx.role !== "owner" && ctx.role !== "admin") return { erro: t("errors.onlyOwner") };
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { portalMessageNotice: str(fd, "notice").slice(0, 200) || null } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "portal.notice", entity: "Workspace", entityId: ctx.workspace.id });
  revalidatePath("/app/portal");
  return { ok: t("noticeSaved") };
}
