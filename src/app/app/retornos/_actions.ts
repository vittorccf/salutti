"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { RECALL_NEXT, RECALL_REASONS } from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { canManageLab, findPatient, patientScope, requireOdonto } from "@/app/app/odonto/_lib";
import { dateKeyOf, str } from "@/app/app/odonto/_form";

const PATH = "/app/retornos";
const requireRecalls = () => requireOdonto("odontograma", canManageLab);

export async function createRecallAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireRecalls();
  const t = await getTranslations("odonto.recall");
  const patient = await findPatient(ctx, str(fd, "patientId"));
  const reason = str(fd, "reason");
  const due = dateKeyOf(str(fd, "dueDate"));
  if (!(RECALL_REASONS as readonly string[]).includes(reason) || !due) return { erro: t("errors.generic") };
  const recall = await db.recall.create({ data: { workspaceId: ctx.workspace.id, patientId: patient.id, reason, dueDate: parseDateOnly(due), note: str(fd, "note") || null } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.recall.create", entity: "Recall", entityId: recall.id });
  revalidatePath(PATH);
  return { ok: t("created", { name: patient.fullName }) };
}

// Contato feito (WhatsApp, ligação) ou mudança de situação: só a próxima válida (feito e cancelado são finais), e só em
// retorno de paciente que quem pede pode ver (escopo do dentista em clínica).
export async function setRecallAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireRecalls();
  const t = await getTranslations("odonto.recall");
  const status = str(fd, "status");
  const contacted = status === "contato";
  const recall = await db.recall.findFirst({
    where: { id: str(fd, "id"), workspaceId: ctx.workspace.id, patient: { deletedAt: null, ...patientScope(ctx) } },
    select: { id: true, status: true },
  });
  if (!recall || (!contacted && !RECALL_NEXT[recall.status]?.includes(status))) return { erro: t("errors.generic") };
  const res = await db.recall.updateMany({
    where: { id: recall.id, status: recall.status },
    data: contacted ? { contactedAt: new Date() } : { status },
  });
  if (!res.count) return { erro: t("errors.generic") };
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.recall", entity: "Recall", entityId: recall.id, metadata: { from: recall.status, to: status } });
  revalidatePath(PATH);
  if (contacted) return { ok: t("contacted") };
  // Agendado, feito ou cancelado saem da lista de pendentes: a confirmação vai pela URL.
  redirect(`${PATH}?atualizado=${status}`);
}
