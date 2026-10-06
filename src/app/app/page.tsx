import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateTimeBR, formatPercentBR, greetingBR, plural } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { insightsEngine } from "@/lib/providers/insights";
import { modalityLabel } from "@/lib/labels";
import { startOfMonthSP, startOfTodaySP } from "@/lib/dates";
import { onboardingProgress } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const wsId = ctx.workspace.id;
  const now = new Date();
  const thisMonth = startOfMonthSP(now);
  const lastMonth = startOfMonthSP(now, -1);
  const today = startOfTodaySP(now);
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);

  const [
    paidThisMonth,
    paidLastMonth,
    overdueAgg,
    upcoming,
    todayAppointments,
    activePatients,
    insights,
  ] = await Promise.all([
    db.charge.aggregate({
      where: { workspaceId: wsId, status: "paid", paidAt: { gte: thisMonth } },
      _sum: { amount: true },
      _count: true,
    }),
    db.charge.aggregate({
      where: { workspaceId: wsId, status: "paid", paidAt: { gte: lastMonth, lt: thisMonth } },
      _sum: { amount: true },
    }),
    db.charge.aggregate({
      where: { workspaceId: wsId, status: { in: ["pending", "overdue"] }, dueDate: { lt: today } },
      _sum: { amount: true },
      _count: true,
    }),
    db.appointment.findMany({
      where: { workspaceId: wsId, startsAt: { gte: now, lte: next7 } },
      include: { patient: true, professional: true },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.appointment.count({
      where: {
        workspaceId: wsId,
        startsAt: { gte: today },
      },
    }),
    db.patient.count({ where: { workspaceId: wsId, active: true, deletedAt: null } }),
    db.aiInsight.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  const onboarding = await onboardingProgress(wsId);

  // Garante insights ao menos uma vez (auto-seed lazy)
  let liveInsights = insights;
  if (liveInsights.length === 0) {
    liveInsights = await insightsEngine.regenerate({ workspaceId: wsId });
  }

  const cur = paidThisMonth._sum.amount ?? 0;
  const prev = paidLastMonth._sum.amount ?? 0;
  const pct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {greetingBR(now)}, {ctx.user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground">
            Resumo de <strong className="text-foreground">{ctx.workspace.name}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/agenda/novo">
              <CalendarDays className="h-4 w-4" /> Agendar
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/financeiro/novo">
              <ArrowUpRight className="h-4 w-4" /> Nova cobrança
            </Link>
          </Button>
        </div>
      </header>

      {!onboarding.complete ? (
        <Card className="border-primary/30">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                Primeiros passos · {onboarding.done} de {onboarding.total}
              </p>
              <p className="text-sm text-muted-foreground">
                Cadastre quem atende, os modelos de anamnese e o primeiro paciente para começar a agendar.
              </p>
            </div>
            <Button asChild>
              <Link href="/app/primeiros-passos">Continuar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receita do mês"
          value={formatBRL(cur)}
          hint={
            pct === 0 ? (
              "Sem dados do mês anterior"
            ) : (
              <span className="inline-flex items-center gap-1">
                {pct > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-success-strong" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive-strong" aria-hidden />
                )}
                <span className={pct > 0 ? "text-success-strong" : undefined}>
                  {pct > 0 ? "+" : ""}
                  {formatPercentBR(pct)} em relação ao mês anterior
                </span>
              </span>
            )
          }
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="A receber em atraso"
          value={formatBRL(overdueAgg._sum.amount ?? 0)}
          hint={plural(overdueAgg._count ?? 0, "cobrança vencida", "cobranças vencidas")}
          tone="warn"
        />
        <KpiCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Sessões a partir de hoje"
          value={String(todayAppointments)}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Pacientes ativos"
          value={String(activePatients)}
        />
      </div>

      {/* IA Insights */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-strong" aria-hidden /> LUMA · insights financeiros e clínicos
              <span className="h-2 w-2 rounded-full bg-highlight" aria-hidden />
            </CardTitle>
            <CardDescription>Gerados a partir dos seus dados em tempo real.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/luma">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {liveInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum insight ainda. Quando você registrar sessões e cobranças, a LUMA analisa os dados aqui.
            </p>
          ) : (
            liveInsights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-md border bg-card p-4 text-sm flex gap-3 items-start"
              >
                <div
                  className={`mt-0.5 grid h-8 w-8 place-content-center rounded-md ${
                    insight.severity === "critical"
                      ? "bg-destructive/10 text-destructive-strong"
                      : insight.severity === "warn"
                        ? "bg-warning/10 text-warning-strong"
                        : "bg-primary/10 text-primary-strong"
                  }`}
                >
                  {insight.kind === "revenue_drop" ? (
                    pct < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">{insight.title}</p>
                  <p className="text-muted-foreground mt-1">{insight.body}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Agenda imediata */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary-strong" aria-hidden /> Próximas sessões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Paciente</TH>
                <TH>Profissional</TH>
                <TH>Quando</TH>
                <TH>Modalidade</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma sessão nos próximos 7 dias. Quando você agendar, ela aparece aqui.
                  </TD>
                </TR>
              ) : (
                upcoming.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.patient.fullName}</TD>
                    <TD>{a.professional.fullName}</TD>
                    <TD className="whitespace-nowrap">{formatDateTimeBR(a.startsAt)}</TD>
                    <TD>{modalityLabel(a.modality)}</TD>
                    <TD>
                      <StatusBadge kind="appointment" status={a.status} />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const KpiCard = ({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "warn";
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div
          className={`grid h-8 w-8 place-content-center rounded-md ${
            tone === "warn" ? "bg-warning/10 text-warning-strong" : "bg-primary/10 text-primary-strong"
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </CardContent>
  </Card>
);
