// Faturamento TISS a partir do banco: sessões elegíveis e geração de lotes.
// O XML é montado por lib/tiss.ts (função pura, validada contra os XSD oficiais).
import { db } from "./db";
import { buildTissLote, tissProfile, type GuideInput, type GuideType, type Prestador } from "./tiss";

export type EligibleSession = {
  id: string;
  startsAt: Date;
  patientName: string;
  professionalName: string;
  price: number;
  guideType: GuideType | null;
  problems: string[];
};

// Sessões realizadas pelo convênio que ainda não viraram guia, com o que falta para faturar.
export async function eligibleSessions(workspaceId: string, insurancePlanId: string): Promise<EligibleSession[]> {
  const appts = await db.appointment.findMany({
    where: { workspaceId, insurancePlanId, status: "done", tissGuide: null },
    include: { patient: true, professional: true },
    orderBy: { startsAt: "asc" },
  });
  return appts.map((a) => {
    const profile = tissProfile(a.professional);
    // Chaves de finance.tiss.*; o motivo vindo de lib/tiss.ts é texto e a tela o converte.
    const problems: string[] = [];
    if (!profile.ok) problems.push(profile.motivo);
    if (!a.patient.insuranceCardNumber) problems.push("noCard");
    if (a.patient.insurancePlanId !== insurancePlanId) problems.push("notLinked");
    if (profile.ok && !a.professional.councilNumber) problems.push("noCouncilNumber");
    if (profile.ok && !a.professional.councilUF) problems.push("noCouncilUF");
    return {
      id: a.id,
      startsAt: a.startsAt,
      patientName: a.patient.fullName,
      professionalName: a.professional.fullName,
      price: a.price,
      guideType: profile.ok ? profile.guideType : null,
      problems,
    };
  });
}

const prestadorOf = (plan: { providerCode: string | null }, workspace: { cnpj: string | null }): Prestador | null => {
  if (plan.providerCode) return { kind: "codigo", value: plan.providerCode };
  const cnpj = workspace.cnpj?.replace(/\D/g, "");
  return cnpj && cnpj.length === 14 ? { kind: "cnpj", value: cnpj } : null;
};

// A mensagem é a chave de finance.tiss.* (a tela traduz no idioma da pessoa).
export class TissError extends Error {}

// Gera um lote por tipo de guia (máx. 100 guias cada) e grava lote e guias numa transação.
export async function generateBatches(workspaceId: string, insurancePlanId: string, appointmentIds: string[]) {
  const [plan, workspace] = await Promise.all([
    db.insurancePlan.findFirst({ where: { id: insurancePlanId, workspaceId } }),
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
  ]);
  if (!plan) throw new TissError("planNotFound");
  const prestador = prestadorOf(plan, workspace);
  if (!prestador) throw new TissError("providerMissing");

  const eligible = (await eligibleSessions(workspaceId, insurancePlanId)).filter((s) => appointmentIds.includes(s.id));
  const ready = eligible.filter((s) => s.problems.length === 0);
  if (ready.length === 0) throw new TissError("noneReady");

  const appts = await db.appointment.findMany({
    where: { id: { in: ready.map((s) => s.id) }, workspaceId },
    include: { patient: true, professional: true },
    orderBy: { startsAt: "asc" },
  });

  // Primeira consulta (1) ou retorno (2): houve sessão realizada antes com o mesmo profissional?
  const tipoConsulta = async (a: (typeof appts)[number]) => {
    const before = await db.appointment.count({
      where: { workspaceId, patientId: a.patientId, professionalId: a.professionalId, status: "done", startsAt: { lt: a.startsAt } },
    });
    return before > 0 ? ("2" as const) : ("1" as const);
  };

  const groups = new Map<GuideType, typeof appts>();
  for (const a of appts) {
    const p = tissProfile(a.professional);
    if (!p.ok) continue;
    groups.set(p.guideType, [...(groups.get(p.guideType) ?? []), a]);
  }

  const created: { id: string; number: number; guides: number; total: number }[] = [];
  for (const [guideType, list] of groups) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const last = await db.tissBatch.findFirst({ where: { workspaceId }, orderBy: { number: "desc" }, select: { number: true } });
      const number = (last?.number ?? 0) + 1;

      const guias: (GuideInput & { appointmentId: string })[] = [];
      for (const [idx, a] of chunk.entries()) {
        const p = tissProfile(a.professional);
        if (!p.ok) continue;
        guias.push({
          appointmentId: a.id,
          numeroGuiaPrestador: `${number}${String(idx + 1).padStart(3, "0")}`,
          beneficiario: { carteira: a.patient.insuranceCardNumber! },
          profissional: {
            nome: a.professional.fullName,
            conselho: p.conselho,
            numeroConselho: a.professional.councilNumber!,
            uf: a.professional.councilUF!,
            cbos: p.cbos,
          },
          inicio: a.startsAt,
          fim: a.endsAt,
          tipoConsulta: await tipoConsulta(a),
          regime: a.modality === "online" ? "05" : "01",
          procedimento: p.procedimento,
          valor: a.price,
        });
      }

      const { xml, hash, total } = buildTissLote({
        sequencialTransacao: String(number),
        numeroLote: String(number),
        registroANS: plan.ansRegistry,
        prestador,
        cnes: workspace.cnes,
        guideType,
        guias,
        geradoEm: new Date(),
      });

      const batch = await db.$transaction(async (tx) => {
        const b = await tx.tissBatch.create({
          data: { workspaceId, insurancePlanId, number, guideType, xml, hash, totalAmount: total },
        });
        await tx.tissGuide.createMany({
          data: guias.map((g) => ({
            workspaceId,
            batchId: b.id,
            appointmentId: g.appointmentId,
            guideNumber: g.numeroGuiaPrestador,
            procedureCode: g.procedimento.codigo,
            amount: g.valor,
          })),
        });
        return b;
      });
      created.push({ id: batch.id, number, guides: guias.length, total });
    }
  }
  return created;
}
