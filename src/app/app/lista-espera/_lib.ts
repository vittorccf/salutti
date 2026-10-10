// Guarda e manutenção da lista de espera (só no servidor).
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireModule } from "@/lib/modules";
import { OPEN_STATUSES, retentionCutoff } from "@/lib/waitlist";

// Módulo liberado para o consultório e permissão de cadastrar pacientes (quem faz o primeiro contato).
export async function requireWaitlist() {
  const ctx = await requireModule("lista_espera");
  if (!ctx.permissions.has("pacientes.gerenciar")) notFound();
  return ctx;
}

// Quem saiu da lista (encerrado ou agendado) há mais de 6 meses é anonimizado: fica só a contagem para as métricas.
// Roda no cron diário (/api/cron/lista-espera) e ao abrir a página; nunca na sessão de suporte, que é somente leitura.
export async function anonymizeExpired(workspaceId?: string) {
  await db.waitlistEntry.updateMany({
    where: { ...(workspaceId ? { workspaceId } : {}), anonymizedAt: null, status: { notIn: OPEN_STATUSES }, statusChangedAt: { lt: retentionCutoff() } },
    data: { fullName: "Anonimizado", phone: null, email: null, guardianName: null, reason: null, notes: null, priceNote: null, anonymizedAt: new Date() },
  });
}
