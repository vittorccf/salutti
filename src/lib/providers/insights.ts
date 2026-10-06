// Engine de IA Preditiva Financeira - determinística.
// Textos na voz do Saluttin (design system): frases curtas, com número e prazo.
// Calcula insights a partir dos dados do workspace.

import { db } from "../db";
import { differenceInDays } from "date-fns";
import { formatBRL, formatPercentBR, plural } from "../utils";
import { startOfMonthSP, startOfTodaySP } from "../dates";

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
  const thisMonthStart = startOfMonthSP(now);
  const lastMonthStart = startOfMonthSP(now, -1);

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
        body: `Você recebeu ${formatBRL(cur)} este mês. Defina uma meta mensal em Ajustes para o Saluttin acompanhar a evolução.`,
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
        title: `Receita caiu ${formatPercentBR(Math.abs(pct))} em relação ao mês anterior`,
        body: `Foram ${formatBRL(cur)} este mês, contra ${formatBRL(prev)} no anterior. Convide esta semana os pacientes sem sessão há mais de 60 dias.`,
        payload: { cur, prev, pct },
      },
    ];
  }
  if (pct > 15) {
    return [
      {
        kind: "revenue_drop",
        severity: "info" as const,
        title: `Receita cresceu ${formatPercentBR(pct)} em relação ao mês anterior`,
        body: `Foram ${formatBRL(cur)} este mês. Bom momento para revisar o valor da sessão dos novos pacientes.`,
        payload: { cur, prev, pct },
      },
    ];
  }
  return [];
};

const overduePattern = async (workspaceId: string) => {
  const overdue = await db.charge.findMany({
    where: { workspaceId, status: { in: ["pending", "overdue"] }, dueDate: { lt: startOfTodaySP() } },
  });
  if (overdue.length === 0) return [];
  const total = overdue.reduce((acc, c) => acc + c.amount, 0);
  return [
    {
      kind: "overdue_pattern",
      severity: overdue.length > 5 ? ("critical" as const) : ("warn" as const),
      title: `${plural(overdue.length, "cobrança em atraso", "cobranças em atraso")} · ${formatBRL(total)}`,
      body: `Ative a régua de cobrança no WhatsApp hoje. Ela costuma recuperar cerca de 70% do valor em atraso.`,
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
        body: `${plural(upcoming, "sessão agendada", "sessões agendadas")} para os próximos 7 dias, abaixo do mínimo de ${Math.round(expected * 0.5)}. Convide os pacientes ativos para reagendar até sexta.`,
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
      title: `${plural(atRisk.length, "paciente sem sessão", "pacientes sem sessão")} há mais de 60 dias`,
      body: `Quem fica tanto tempo sem sessão tem 3 vezes mais chance de interromper o tratamento. Envie um lembrete esta semana.`,
      payload: { atRiskIds: atRisk.map((p) => p.id), names: atRisk.map((p) => p.fullName) },
    },
  ];
};
