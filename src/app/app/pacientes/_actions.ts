"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { assertInsurancePlan, assertInWorkspace } from "@/lib/tenant";
import { ContactError, readAddress, validEmail, validPhone } from "@/lib/contact-validation";
import type { FormResult } from "@/components/forms/action-form";
import { UploadError } from "@/lib/media";
import { stageImage, type StagedImage } from "@/lib/media-store";

// Foto do paciente só com autorização registrada (finalidade própria: identificação na recepção).
const recordPhotoConsent = (workspaceId: string, patientId: string) =>
  db.consentRecord.create({
    data: { workspaceId, patientId, purpose: "foto_identificacao", legalBasis: "consentimento", granted: true },
  });

const text = (max = 200) => z.string().trim().max(max).optional();
const schema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
  cpf: text(20),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  pronouns: text(40),
  responsibleName: text(120),
  emergencyContact: text(160),
  notes: text(2000),
  insurancePlanId: z.string().optional(),
  insuranceCardNumber: text(20),
});

type Previous = { email: string | null; phone: string | null; address: string | null; photoId: string | null } | null;

async function readPatient(formData: FormData, workspaceId: string, previous: Previous = null) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new ContactError(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.insurancePlanId) await assertInsurancePlan(workspaceId, d.insurancePlanId);
  // O select de convênio só aparece quando há planos; sem ele, o convênio atual fica como está.
  const insurance = formData.has("insurancePlanId")
    ? {
        insurancePlanId: d.insurancePlanId || null,
        insuranceCardNumber: d.insurancePlanId ? d.insuranceCardNumber || null : null,
      }
    : {};
  return {
    fullName: d.fullName,
    email: await validEmail(formData.get("email"), { previous: previous?.email }),
    phone: validPhone(formData.get("phone"), { country: formData.get("phoneCountry"), previous: previous?.phone }),
    cpf: d.cpf || null,
    birthDate: d.birthDate ? parseDateOnly(d.birthDate) : null,
    pronouns: d.pronouns || null,
    responsibleName: d.responsibleName || null,
    emergencyContact: d.emergencyContact || null,
    notes: d.notes || null,
    ...insurance,
    ...readAddress(formData),
    // Endereço antigo (texto livre) só some quando a pessoa pede.
    ...(formData.get("clearLegacyAddress") === "on" ? { address: null } : {}),
  };
}

const fail = (e: unknown): FormResult => {
  if (e instanceof ContactError || e instanceof UploadError) return { erro: e.message };
  throw e;
};

export async function createPatientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  let data: Awaited<ReturnType<typeof readPatient>>;
  try {
    data = await readPatient(formData, ctx.workspace.id);
  } catch (e) {
    return fail(e);
  }
  let photo: StagedImage;
  try {
    photo = await stageImage(formData, "photo", null, "patient_photo", { workspaceId: ctx.workspace.id }, { requireConsent: true });
  } catch (e) {
    return fail(e);
  }
  const consents = [
    ...(formData.get("consent") === "on" ? [{ workspaceId: ctx.workspace.id, purpose: "tutela_saude", legalBasis: "tutela_saude" }] : []),
    // Foto só com autorização própria (finalidade: identificação na recepção).
    ...(photo.id ? [{ workspaceId: ctx.workspace.id, purpose: "foto_identificacao", legalBasis: "consentimento" }] : []),
  ];
  const patient = await db.patient
    .create({
      data: {
        workspaceId: ctx.workspace.id,
        ...data,
        photoId: photo.id,
        ...(consents.length ? { consentRecords: { create: consents.map((c) => ({ ...c, granted: true })) } } : {}),
      },
    })
    .catch(async (e) => {
      await photo.rollback();
      throw e;
    });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.create",
    entity: "Patient",
    entityId: patient.id,
    metadata: photo.id ? { photo: "added" } : undefined,
  });
  redirect(`/app/pacientes/${patient.id}`);
}

export async function updatePatientAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  const patientId = String(formData.get("patientId"));
  await assertInWorkspace(ctx.workspace.id, { patientId });
  const previous = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id },
    select: { email: true, phone: true, address: true, photoId: true },
  });
  let data: Awaited<ReturnType<typeof readPatient>>;
  let photo: StagedImage;
  try {
    data = await readPatient(formData, ctx.workspace.id, previous);
    photo = await stageImage(formData, "photo", previous?.photoId ?? null, "patient_photo", { workspaceId: ctx.workspace.id }, { requireConsent: true });
  } catch (e) {
    return fail(e);
  }
  await db.patient
    .updateMany({ where: { id: patientId, workspaceId: ctx.workspace.id }, data: { ...data, photoId: photo.id } })
    .catch(async (e) => {
      await photo.rollback();
      throw e;
    });
  await photo.commit();
  if (photo.changed && photo.id) await recordPhotoConsent(ctx.workspace.id, patientId);
  if (photo.changed && !photo.id) {
    // Foto removida: a autorização de uso deixa de valer (fica registrada a revogação).
    await db.consentRecord.updateMany({
      where: { workspaceId: ctx.workspace.id, patientId, purpose: "foto_identificacao", revokedAt: null },
      data: { granted: false, revokedAt: new Date() },
    });
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.update",
    entity: "Patient",
    entityId: patientId,
    metadata: photo.changed ? { photo: photo.id ? "replaced" : "removed" } : undefined,
  });
  redirect(`/app/pacientes/${patientId}`);
}
