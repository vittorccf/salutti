// Progresso dos primeiros passos, calculado a partir dos dados do consultório (sem tabela própria).
import { db } from "./db";

export type OnboardingStep = { key: string; done: boolean; optional?: boolean };

export async function onboardingProgress(workspaceId: string) {
  const [professionals, templates, patients, appointments] = await Promise.all([
    db.professional.count({ where: { workspaceId } }),
    db.anamnesisTemplate.count({ where: { workspaceId } }),
    db.patient.count({ where: { workspaceId, deletedAt: null } }),
    db.appointment.count({ where: { workspaceId } }),
  ]);
  const steps: OnboardingStep[] = [
    { key: "profissional", done: professionals > 0 },
    { key: "anamnese", done: templates > 0 },
    { key: "integracoes", done: false, optional: true },
    { key: "paciente", done: patients > 0 },
    { key: "sessao", done: appointments > 0 },
  ];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return { steps, done, total: required.length, complete: done === required.length };
}
