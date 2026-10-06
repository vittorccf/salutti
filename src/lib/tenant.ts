// Isolamento entre consultórios (multi-tenant). Todo id que chega de formulário é dado do cliente:
// antes de gravar, confirme que o registro pertence ao workspace ativo. Se não pertencer, 404
// (não revela que o registro existe em outro consultório).
import { notFound } from "next/navigation";
import { db } from "./db";

type Refs = {
  patientId?: string | null;
  professionalId?: string | null;
  appointmentId?: string | null;
  templateId?: string | null;
};

export async function assertInWorkspace(workspaceId: string, refs: Refs) {
  const checks: Promise<number>[] = [];
  if (refs.patientId) checks.push(db.patient.count({ where: { id: refs.patientId, workspaceId, deletedAt: null } }));
  if (refs.professionalId) checks.push(db.professional.count({ where: { id: refs.professionalId, workspaceId } }));
  if (refs.appointmentId) {
    checks.push(
      db.appointment.count({
        where: { id: refs.appointmentId, workspaceId, ...(refs.patientId ? { patientId: refs.patientId } : {}) },
      }),
    );
  }
  if (refs.templateId) checks.push(db.anamnesisTemplate.count({ where: { id: refs.templateId, workspaceId } }));
  const counts = await Promise.all(checks);
  if (counts.some((c) => c === 0)) notFound();
}

// Resultado de updateMany/deleteMany filtrado por workspace: nada afetado = registro de outro consultório.
export const ensureAffected = (result: { count: number }) => {
  if (result.count === 0) notFound();
};
