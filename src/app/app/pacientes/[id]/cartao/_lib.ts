// Guarda do cartão diário (lado do profissional): módulo liberado, papel clínico e paciente no escopo de quem vê.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireModule } from "@/lib/modules";
import { portalPatientScope } from "@/lib/portal";

export async function requireDiaryPatient(id: string) {
  const ctx = await requireModule("cartao_diario", { clinical: true });
  const patient = await db.patient.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null, ...portalPatientScope(ctx) },
    select: { id: true, fullName: true, portalAccess: { select: { active: true, activatedAt: true } } },
  });
  if (!patient) notFound();
  return { ctx, patient };
}
