"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { LAB_NEXT } from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { canManageLab, findPatient, patientScope, requireOdonto } from "@/app/app/odonto/_lib";
import { dateKeyOf, money, str } from "@/app/app/odonto/_form";

const PATH = "/app/protese";
const requireLab = () => requireOdonto("protese", canManageLab);

// Nova ordem de serviço para o laboratório (a via que fica no consultório).
export async function createLabOrderAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireLab();
  const t = await getTranslations("odonto.lab");
  const patient = await findPatient(ctx, str(fd, "patientId"));
  const lab = str(fd, "lab", 120);
  const work = str(fd, "work", 160);
  if (!lab || !work) return { erro: t("errors.required") };
  const professionalId = str(fd, "professionalId") || null;
  if (professionalId) await assertInWorkspace(ctx.workspace.id, { professionalId });
  const sent = dateKeyOf(str(fd, "sentAt"));
  const due = dateKeyOf(str(fd, "dueAt"));
  if (sent && due && due < sent) return { erro: t("errors.dueBeforeSent") };
  const costRaw = str(fd, "cost");
  const cost = costRaw ? money(costRaw) : null;
  if (costRaw && cost === null) return { erro: t("errors.cost") };
  const order = await db.labOrder.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: patient.id,
      professionalId,
      lab,
      work,
      teeth: str(fd, "teeth", 80) || null,
      shade: str(fd, "shade", 20) || null,
      status: sent ? "enviado" : "a_enviar",
      sentAt: sent ? parseDateOnly(sent) : null,
      dueAt: due ? parseDateOnly(due) : null,
      cost,
      notes: str(fd, "notes", 1000) || null,
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.lab.create", entity: "LabOrder", entityId: order.id });
  revalidatePath(PATH);
  return { ok: t("created", { work }) };
}

// Próxima etapa (enviado, prova, recebido, instalado, refazer, cancelado): só a válida a partir da atual, e só em
// trabalho de paciente que quem pede pode ver (escopo do dentista em clínica).
export async function setLabStatusAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireLab();
  const t = await getTranslations("odonto.lab");
  const status = str(fd, "status");
  const order = await db.labOrder.findFirst({
    where: { id: str(fd, "id"), workspaceId: ctx.workspace.id, patient: { deletedAt: null, ...patientScope(ctx) } },
    select: { id: true, status: true },
  });
  if (!order || !(LAB_NEXT[order.status] as string[] | undefined)?.includes(status)) return { erro: t("errors.generic") };
  const now = new Date();
  const res = await db.labOrder.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status,
      ...(status === "enviado" || status === "refazer" ? { sentAt: now, receivedAt: null } : {}),
      ...(status === "recebido" ? { receivedAt: now } : {}),
      ...(status === "refazer" ? { dueAt: null } : {}),
    },
  });
  if (!res.count) return { erro: t("errors.generic") };
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.lab.status", entity: "LabOrder", entityId: order.id, metadata: { from: order.status, to: status } });
  revalidatePath(PATH);
  // O trabalho pode sair da lista em que estava (ex.: recebido): a confirmação vai pela URL.
  redirect(`${PATH}?atualizado=${status}`);
}
