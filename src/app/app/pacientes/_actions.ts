"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { assertInsurancePlan, assertInWorkspace } from "@/lib/tenant";
import { ContactError, readAddress, validEmail, validPhone } from "@/lib/contact-validation";

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

async function readPatient(formData: FormData, workspaceId: string) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new ContactError(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.insurancePlanId) await assertInsurancePlan(workspaceId, d.insurancePlanId);
  return {
    fullName: d.fullName,
    email: await validEmail(formData.get("email")),
    phone: validPhone(formData.get("phone")),
    cpf: d.cpf || null,
    birthDate: d.birthDate ? parseDateOnly(d.birthDate) : null,
    pronouns: d.pronouns || null,
    responsibleName: d.responsibleName || null,
    emergencyContact: d.emergencyContact || null,
    notes: d.notes || null,
    insurancePlanId: d.insurancePlanId || null,
    insuranceCardNumber: d.insurancePlanId ? d.insuranceCardNumber || null : null,
    ...readAddress(formData),
  };
}

const fail = (path: string, e: unknown): never => {
  if (e instanceof ContactError) redirect(`${path}?erro=${encodeURIComponent(e.message)}`);
  throw e;
};

export async function createPatientAction(formData: FormData) {
  const ctx = await requireContext();
  let data: Awaited<ReturnType<typeof readPatient>>;
  try {
    data = await readPatient(formData, ctx.workspace.id);
  } catch (e) {
    return fail("/app/pacientes/novo", e);
  }
  const patient = await db.patient.create({
    data: {
      workspaceId: ctx.workspace.id,
      ...data,
      ...(formData.get("consent") === "on"
        ? {
            consentRecords: {
              create: [{ workspaceId: ctx.workspace.id, purpose: "tutela_saude", legalBasis: "tutela_saude", granted: true }],
            },
          }
        : {}),
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.create",
    entity: "Patient",
    entityId: patient.id,
  });
  redirect(`/app/pacientes/${patient.id}`);
}

export async function updatePatientAction(formData: FormData) {
  const ctx = await requireContext();
  const patientId = String(formData.get("patientId"));
  await assertInWorkspace(ctx.workspace.id, { patientId });
  let data: Awaited<ReturnType<typeof readPatient>>;
  try {
    data = await readPatient(formData, ctx.workspace.id);
  } catch (e) {
    return fail(`/app/pacientes/${patientId}/editar`, e);
  }
  await db.patient.updateMany({ where: { id: patientId, workspaceId: ctx.workspace.id }, data });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.update",
    entity: "Patient",
    entityId: patientId,
  });
  redirect(`/app/pacientes/${patientId}`);
}
