import Link from "next/link";
import { startOfMonth, subMonths } from "date-fns";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateTimeBR } from "@/lib/utils";
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

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const wsId = ctx.workspace.id;
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(subMonths(now, 1));
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
      where: { workspaceId: wsId, status: { in: ["pending", "overdue"] }, dueDate: { lt: now } },
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
        startsAt: { gte: new Date(now.toISOString().slice(0, 10)) },
      },
    }),
    db.patient.count({ where: { workspaceId: wsId, active: true, deletedAt: null } }),
    db.aiInsight.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

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
          <h1 className="text-3xl font-bold">Bom dia, {ctx.user.name.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground">
            Resumo do workspace <strong>{ctx.workspace.name}</strong> - {ctx.workspace.segment.replace("_", " ")}
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

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Receita do mês"
          value={formatBRL(cur)}
          hint={
            pct === 0 ? (
              "Sem dados anteriores"
            ) : pct > 0 ? (
              <span className="text-success">▲ {pct.toFixed(1)}% vs mês anterior</span>
            ) : (
              <span className="text-destructive">▼ {pct.toFixed(1)}% vs mês anterior</span>
            )
          }
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="A receber em atraso"
          value={formatBRL(overdueAgg._sum.amount ?? 0)}
          hint={`${overdueAgg._count ?? 0} cobrança(s) vencida(s)`}
          tone="warn"
        />
        <KpiCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Sessões agendadas (hoje +)"
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
              <Sparkles className="h-5 w-5 text-primary" /> LUMA - insights financeiros &amp; clínicos
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
              Sem insights ainda - comece registrando sessões e cobranças.
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
                      ? "bg-destructive/10 text-destructive"
                      : insight.severity === "warn"
                        ? "bg-warning/10 text-warning"
                        : "bg-primary/10 text-primary"
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
            <Clock className="h-5 w-5 text-primary" /> Próximas sessões
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
                    Nenhuma sessão na próxima semana.
                  </TD>
                </TR>
              ) : (
                upcoming.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.patient.fullName}</TD>
                    <TD>{a.professional.fullName}</TD>
                    <TD>{formatDateTimeBR(a.startsAt)}</TD>
                    <TD className="capitalize">{a.modality}</TD>
                    <TD>
                      <Badge variant={a.status === "confirmed" ? "success" : "muted"}>{a.status}</Badge>
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
            tone === "warn" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </CardContent>
  </Card>
);
