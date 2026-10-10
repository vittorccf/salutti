"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isToothStatus, isValidTooth, normalizeFaces } from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { canClinicalWrite, findPatient, requireOdonto } from "@/app/app/odonto/_lib";

const str = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);

// Situação de um dente no odontograma. Hígido sem observação apaga o registro (dente sem linha = hígido).
export async function saveToothAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canClinicalWrite);
  const t = await getTranslations("odonto.chart");
  const patient = await findPatient(ctx, str(fd, "patientId"));
  const tooth = Number(str(fd, "tooth"));
  const status = str(fd, "status");
  if (!isValidTooth(tooth) || !isToothStatus(status)) return { erro: t("errors.invalid") };
  const faces = ["carie", "restaurado", "fratura", "selado"].includes(status) ? normalizeFaces(fd.getAll("faces").map(String).join(""), tooth) : null;
  const note = str(fd, "note", 500) || null;
  if (status === "higido" && !note) {
    await db.toothRecord.deleteMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id, tooth } });
  } else {
    await db.toothRecord.upsert({
      where: { patientId_tooth: { patientId: patient.id, tooth } },
      create: { workspaceId: ctx.workspace.id, patientId: patient.id, tooth, status, faces, note, updatedById: ctx.user.id },
      update: { status, faces, note, updatedById: ctx.user.id },
    });
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.tooth", entity: "Patient", entityId: patient.id, metadata: { tooth, status } });
  revalidatePath(`/app/pacientes/${patient.id}/odontograma`);
  return { ok: t("saved", { tooth }) };
}
