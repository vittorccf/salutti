// Engine de IA Preditiva Financeira - determinística.
// Calcula insights a partir dos dados do workspace.

import { db } from "../db";
import { differenceInDays, startOfMonth, subMonths } from "date-fns";

type InsightInput = { workspaceId: string };

type ComputedInsight = {
  kind: string;
  severity: "info" | "warn" | "critical";
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

export const insightsEngine = {
  async computeAll({ workspaceId }: InsightInput): Promise<ComputedInsight[]> {
    const out: ComputedInsight[] = [];
    out.push(...(await revenueTrend(workspaceId)));
    out.push(...(await overduePattern(workspaceId)));
    out.push(...(await schedulingGap(workspaceId)));
    out.push(...(await churnRisk(workspaceId)));
    return out;
  },

  async regenerate({ workspaceId }: InsightInput) {
    const items = await this.computeAll({ workspaceId });
    await db.aiInsight.deleteMany({ where: { workspaceId } });
    if (items.length === 0) return [];
    await db.aiInsight.createMany({
      data: items.map((i) => ({
        workspaceId,
        kind: i.kind,
        severity: i.severity,
        title: i.title,
        body: i.body,
        payload: i.payload ? JSON.stringify(i.payload) : null,
      })),
    });
    return db.aiInsight.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  },
};

const revenueTrend = async (workspaceId: string) => {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));

  const [thisMonth, lastMonth] = await Promise.all([
    db.charge.aggregate({
      where: { workspaceId, paidAt: { gte: thisMonthStart }, status: "paid" },
      _sum: { amount: true },
    }),
    db.charge.aggregate({
      where: { workspaceId, paidAt: { gte: lastMonthStart, lt: thisMonthStart }, status: "paid" },
      _sum: { amount: true },
    }),
  ]);

  const cur = thisMonth._sum.amount ?? 0;
  const prev = lastMonth._sum.amount ?? 0;
  if (prev === 0 && cur === 0) return [];
  if (prev === 0) {
    return [
      {
        kind: "revenue_drop",
        severity: "info" as const,
        title: "Primeiro mês de faturamento registrado",
        body: `Receita acumulada no mês atual: R$ ${cur.toFixed(2)}. Defina meta mensal nos Ajustes para que o LUMA acompanhe a evolução.`,
        payload: { cur, prev },
      },
    ];
  }
  const pct = ((cur - prev) / prev) * 100;
  if (pct < -10) {
    return [
      {
        kind: "revenue_drop",
        severity: "warn" as const,
        title: `Receita caiu ${pct.toFixed(1)}% vs mês anterior`,
        body: `O LUMA detectou queda de ${pct.toFixed(1)}% na receita realizada (R$ ${cur.toFixed(2)} este mês vs R$ ${prev.toFixed(2)} no anterior). Sugestão: revisar canais de captação e reativar pacientes inativos há mais de 60 dias.`,
        payload: { cur, prev, pct },
      },
    ];
  }
  if (pct > 15) {
    return [
      {
        kind: "revenue_drop",
        severity: "info" as const,
        title: `Receita cresceu ${pct.toFixed(1)}% - tendência positiva`,
        body: `Boa performance do mês. Receita atual: R$ ${cur.toFixed(2)}. Reaproveite o momento ajustando preço médio dos novos atendimentos.`,
        payload: { cur, prev, pct },
      },
    ];
  }
  return [];
};

const overduePattern = async (workspaceId: string) => {
  const overdue = await db.charge.findMany({
    where: { workspaceId, status: { in: ["pending", "overdue"] }, dueDate: { lt: new Date() } },
  });
  if (overdue.length === 0) return [];
  const total = overdue.reduce((acc, c) => acc + c.amount, 0);
  return [
    {
      kind: "overdue_pattern",
      severity: overdue.length > 5 ? ("critical" as const) : ("warn" as const),
      title: `${overdue.length} cobrança(s) em atraso - R$ ${total.toFixed(2)}`,
      body: `Há ${overdue.length} cobrança(s) vencida(s) totalizando R$ ${total.toFixed(2)}. Ativar régua de cobrança automática via WhatsApp deve recuperar ~70% conforme benchmark do setor.`,
      payload: { count: overdue.length, total },
    },
  ];
};

const schedulingGap = async (workspaceId: string) => {
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const upcoming = await db.appointment.count({
    where: { workspaceId, startsAt: { gte: new Date(), lte: next7 } },
  });
  const professionals = await db.professional.count({ where: { workspaceId, active: true } });
  if (professionals === 0) return [];
  const expected = professionals * 12; // ~12 slots/profissional na semana
  if (upcoming < expected * 0.5) {
    return [
      {
        kind: "scheduling_gap",
        severity: "warn" as const,
        title: "Agenda dos próximos 7 dias com ocupação baixa",
        body: `Apenas ${upcoming} sessões agendadas para os próximos 7 dias (expectativa mínima: ${Math.round(expected * 0.5)}). Sugestão: campanha de reagendamento para pacientes ativos.`,
        payload: { upcoming, expected },
      },
    ];
  }
  return [];
};

const churnRisk = async (workspaceId: string) => {
  const sinceDays = 60;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDays);

  const patients = await db.patient.findMany({
    where: { workspaceId, active: true, deletedAt: null },
    include: { appointments: { orderBy: { startsAt: "desc" }, take: 1 } },
  });
  const atRisk = patients.filter((p) => {
    const last = p.appointments[0]?.startsAt;
    if (!last) return false;
    return differenceInDays(new Date(), last) >= sinceDays;
  });
  if (atRisk.length === 0) return [];
  return [
    {
      kind: "churn_risk",
      severity: atRisk.length > 5 ? ("warn" as const) : ("info" as const),
      title: `${atRisk.length} paciente(s) em risco de churn (60+ dias sem sessão)`,
      body: `Pacientes com ausência prolongada têm 3x mais chance de descontinuar tratamento. Envie um lembrete personalizado ou ofereça reagendamento.`,
      payload: { atRiskIds: atRisk.map((p) => p.id), names: atRisk.map((p) => p.fullName) },
    },
  ];
};
