// Alertas do cartão diário (só no servidor): questionário com sinal de risco (PHQ-9 item 9) sem conduta registrada.
// Aparecem numa faixa no topo de todas as telas do app e na ficha do paciente, para quem é clínico e vê o paciente.
import { db } from "./db";
import { moduleEnabled } from "./areas";
import { canSeeClinical } from "./permissions";
import { portalPatientScope } from "./portal";

import type { requireContext } from "./auth";

type Ctx = Awaited<ReturnType<typeof requireContext>>;

export async function pendingRiskAlerts(ctx: Ctx, patientId?: string) {
  if (!canSeeClinical(ctx) || !moduleEnabled(ctx.workspace, "cartao_diario")) return [];
  const rows = await db.instrumentResponse.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      riskFlag: true,
      reviewedAt: null,
      ...(patientId ? { patientId } : {}),
      patient: { deletedAt: null, ...portalPatientScope(ctx) },
    },
    select: { patientId: true, createdAt: true, patient: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const byPatient = new Map<string, { patientId: string; fullName: string; count: number; since: Date }>();
  for (const r of rows) {
    const cur = byPatient.get(r.patientId);
    if (cur) cur.count++;
    else byPatient.set(r.patientId, { patientId: r.patientId, fullName: r.patient.fullName, count: 1, since: r.createdAt });
  }
  return [...byPatient.values()];
}
