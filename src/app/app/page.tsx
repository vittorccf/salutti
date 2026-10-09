import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { SupportAccessNotice } from "./_components/support/support-access";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  CakeSlice,
  CalendarDays,
  Clock,
  Package,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { insightsEngine } from "@/lib/providers/insights";
import { dateKeySP, parseDateOnly, startOfMonthSP, startOfTodaySP } from "@/lib/dates";
import { onboardingProgress } from "@/lib/onboarding";
import { upcomingBirthdays, type BirthdayPerson } from "@/lib/birthdays";
import { moduleEnabled } from "@/lib/areas";
import { stockAlerts } from "@/lib/stock";
import { SALUTTIN_ENABLED } from "@/lib/features";
import { canManagePayables } from "@/lib/permissions";
import { addDaysKey, paidPrincipal } from "@/lib/payables";

export const dynamic = "force-dynamic";

// Saber quem é paciente já é dado sensível: recepção e financeiro não veem; na clínica, cada profissional vê
// só quem ele atende (cadastro profissional com o mesmo e-mail do usuário); a pessoa pode desligar em Ajustes.
async function patientBirthdaysFor(ctx: Awaited<ReturnType<typeof requireContext>>) {
  if (!ctx.user.showPatientBirthdays || ctx.role === "receptionist" || ctx.role === "financial") return [];
  const base = { workspaceId: ctx.workspace.id, active: true, deletedAt: null, anonymized: false, birthDate: { not: null } };
  const where =
    ctx.workspace.accountType === "clinica"
      ? {
          ...base,
          appointments: {
            some: { professional: { email: { equals: ctx.user.email, mode: "insensitive" as const } } },
          },
        }
      : base;
  return db.patient.findMany({ where, select: { id: true, fullName: true, birthDate: true } });
}

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
    patientBirthdays,
    professionalBirthdays,
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
    patientBirthdaysFor(ctx),
    db.professional.findMany({
      where: { workspaceId: wsId, active: true, birthDate: { not: null } },
      select: { id: true, fullName: true, email: true, birthDate: true },
    }),
  ]);

  // O cadastro profissional do próprio usuário (mesmo e-mail) não aparece duas vezes.
  const people: BirthdayPerson[] = [
    ...(ctx.user.birthDate ? [{ kind: "self" as const, id: ctx.user.id, name: ctx.user.name, birthDate: ctx.user.birthDate }] : []),
    ...professionalBirthdays
      .filter((p) => !(ctx.user.birthDate && p.email?.toLowerCase() === ctx.user.email.toLowerCase()))
      .map((p) => ({ kind: "professional" as const, id: p.id, name: p.fullName, birthDate: p.birthDate! })),
    ...patientBirthdays.map((p) => ({ kind: "patient" as const, id: p.id, name: p.fullName, birthDate: p.birthDate! })),
  ];
  const birthdays = upcomingBirthdays(people, now, 7);
  const myBirthdayToday = birthdays.some((b) => b.kind === "self" && b.daysUntil === 0);

  const onboarding = await onboardingProgress(wsId);

  // Alertas de estoque (área com o módulo ligado): abaixo do mínimo, vencendo em 30 dias, vencido ou aberto vencido.
  const stock = moduleEnabled(ctx.workspace, "estoque") ? await stockAlerts(wsId, now) : null;
  const stockCounts = stock
    ? {
        low: stock.low.length,
        expiring: stock.lots.filter((l) => l.status === "vencendo").length,
        expired: stock.lots.filter((l) => l.status === "vencido" || l.status === "aberto_vencido").length,
      }
    : null;
  const stockTotal = stockCounts ? stockCounts.low + stockCounts.expiring + stockCounts.expired : 0;

  // Contas a pagar vencidas e que vencem em 7 dias (só para quem cuida do financeiro).
  const payables = canManagePayables(ctx) && moduleEnabled(ctx.workspace, "contas_pagar") ? await payablesDue(wsId) : null;

  // Garante insights ao menos uma vez (auto-seed lazy)
  let liveInsights = insights;
  if (SALUTTIN_ENABLED && liveInsights.length === 0) {
    liveInsights = await insightsEngine.regenerate({ workspaceId: wsId });
  }

  const cur = paidThisMonth._sum.amount ?? 0;
  const prev = paidLastMonth._sum.amount ?? 0;
  const pct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;

  const [t, tc, tb, tg, f, label, ts] = await Promise.all([
    getTranslations("dashboard.home"),
    getTranslations("common.actions"),
    getTranslations("common.birthdays"),
    getTranslations("common.greeting"),
    getFormat(),
    getTranslations("common.labels").then(labeler),
    getTranslations("stock.dashboard"),
  ]);
  const tp = await getTranslations("payables.dashboard");
  const hour = f.hour(now);
  const greeting = tg(hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening");
  const firstName = ctx.user.name.split(" ")[0];
  const whenLabel = (days: number) => (days === 0 ? tb("today") : days === 1 ? tb("tomorrow") : tb("inDays", { days }));
  // "DD/MM" → dia e mês no formato do idioma.
  const dayMonth = (dm: string) => {
    const [d, m] = dm.split("/").map(Number);
    return new Intl.DateTimeFormat(f.locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(Date.UTC(2000, m - 1, d));
  };

  return (
    <div className="ds2-glow -m-4 min-h-[calc(100vh-57px)] space-y-8 p-4 md:-m-6 md:p-6">
      {ctx.role === "owner" || ctx.role === "admin" ? <SupportAccessNotice workspaceId={wsId} /> : null}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-display">
            {myBirthdayToday ? tb("happyBirthday", { name: firstName }) : t("greeting", { greeting, name: firstName })}
          </h1>
          <p className="text-muted-foreground">
            {t.rich("summary", {
              workspace: ctx.workspace.name,
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/agenda/novo">
              <CalendarDays className="h-4 w-4" aria-hidden /> {t("schedule")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/financeiro/novo">
              <ArrowUpRight className="h-4 w-4" aria-hidden /> {t("newCharge")}
            </Link>
          </Button>
        </div>
      </header>

      {!onboarding.complete ? (
        <Card className="border-brand/30">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                {t("onboardingTitle", { done: onboarding.done, total: onboarding.total })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("onboardingHint")}
              </p>
            </div>
            <Button asChild>
              <Link href="/app/primeiros-passos">{tc("continue")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {birthdays.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CakeSlice className="h-5 w-5 text-brand" aria-hidden /> {tb("title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {birthdays.map((b) => (
                <li
                  key={`${b.kind}-${b.id}`}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${b.daysUntil === 0 ? "border-brand/40 bg-accent/40" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {b.kind === "patient" ? (
                        <Link href={`/app/pacientes/${b.id}`} className="hover:underline underline-offset-4">
                          {b.name}
                        </Link>
                      ) : b.kind === "self" ? (
                        tb("you")
                      ) : (
                        b.name
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.kind === "patient" ? tb("patient") : b.kind === "professional" ? tb("team") : tb("yours")} · {dayMonth(b.dayMonth)}
                      {b.kind !== "patient" && b.turning > 0 ? ` · ${tb("turning", { age: b.turning })}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${b.daysUntil === 0 ? "text-brand" : "text-muted-foreground"}`}>
                    {whenLabel(b.daysUntil)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {stockCounts && stockTotal > 0 ? (
        <Card className="border-warning/40">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-content-center rounded-md bg-warning/10 text-warning-strong">
                <Package className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">{ts("title", { count: stockTotal })}</p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {stockCounts.low > 0 ? (
                    <li>
                      <Link href="/app/estoque?situacao=baixo" className="text-brand hover:underline underline-offset-4">
                        {ts("low", { count: stockCounts.low })}
                      </Link>
                    </li>
                  ) : null}
                  {stockCounts.expiring > 0 ? (
                    <li>
                      <Link href="/app/estoque?situacao=vencendo" className="text-brand hover:underline underline-offset-4">
                        {ts("expiring", { count: stockCounts.expiring })}
                      </Link>
                    </li>
                  ) : null}
                  {stockCounts.expired > 0 ? (
                    <li>
                      <Link href="/app/estoque?situacao=vencido" className="text-brand hover:underline underline-offset-4">
                        {ts("expired", { count: stockCounts.expired })}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/estoque?situacao=alertas">{ts("open")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {payables && (payables.overdue.count > 0 || payables.soon.count > 0) ? (
        <Card className={payables.overdue.count > 0 ? "border-destructive/40" : "border-warning/40"}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-content-center rounded-md bg-warning/10 text-warning-strong">
                <Banknote className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">{tp("title")}</p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {payables.overdue.count > 0 ? (
                    <li>
                      <Link href="/app/financeiro/pagar?status=overdue" className="text-brand hover:underline underline-offset-4">
                        {tp("overdue", { count: payables.overdue.count, amount: f.money(payables.overdue.cents / 100) })}
                      </Link>
                    </li>
                  ) : null}
                  {payables.soon.count > 0 ? (
                    <li>
                      <Link href="/app/financeiro/pagar?status=next7" className="text-brand hover:underline underline-offset-4">
                        {tp("soon", { count: payables.soon.count, amount: f.money(payables.soon.cents / 100) })}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/financeiro/pagar">{tp("open")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          label={t("revenueMonth")}
          value={f.money(cur)}
          hint={
            pct === 0 ? (
              t("noPreviousMonth")
            ) : (
              <span className="inline-flex items-center gap-1">
                {pct > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-success-strong" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive-strong" aria-hidden />
                )}
                <span className={pct > 0 ? "text-success-strong" : undefined}>
                  {t("vsPreviousMonth", { pct: `${pct > 0 ? "+" : ""}${f.percent(pct)}` })}
                </span>
              </span>
            )
          }
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          label={t("overdue")}
          value={f.money(overdueAgg._sum.amount ?? 0)}
          hint={t("overdueCount", { count: overdueAgg._count ?? 0 })}
          tone="warn"
        />
        <KpiCard
          icon={<CalendarDays className="h-4 w-4" aria-hidden />}
          label={t("sessionsFromToday")}
          value={f.number(todayAppointments)}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" aria-hidden />}
          label={t("activePatients")}
          value={f.number(activePatients)}
        />
      </div>

      {/* Insights do Saluttin: o ponto pêssego é o indicador; o degradê da borda fica só em /app/saluttin
          (o painel já tem o brilho do topo, e a IA não deve parecer a autoridade da tela). */}
      {SALUTTIN_ENABLED ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" aria-hidden /> {t("insightsTitle")}
                <span className="h-2 w-2 rounded-full bg-highlight" aria-hidden />
              </CardTitle>
              <CardDescription>{t("insightsDescription")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/saluttin">{tc("seeAll")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {liveInsights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noInsights")}
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
                          : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {insight.kind === "revenue_drop" ? (
                      pct < 0 ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
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
      ) : null}

      {/* Agenda imediata */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-brand" aria-hidden /> {t("upcomingTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{t("patient")}</TH>
                <TH>{t("professional")}</TH>
                <TH>{t("when")}</TH>
                <TH>{t("modality")}</TH>
                <TH>{t("status")}</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-muted-foreground">
                    {t("noUpcoming")}
                  </TD>
                </TR>
              ) : (
                upcoming.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.patient.fullName}</TD>
                    <TD>{a.professional.fullName}</TD>
                    <TD className="whitespace-nowrap">{f.dateTime(a.startsAt)}</TD>
                    <TD>{label("modality", a.modality)}</TD>
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
            tone === "warn" ? "bg-warning/10 text-warning-strong" : "bg-accent text-accent-foreground"
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </CardContent>
  </Card>
);

// Saldo em aberto das contas a pagar vencidas e das que vencem nos próximos 7 dias (com hoje).
async function payablesDue(workspaceId: string) {
  const today = dateKeySP();
  const rows = await db.payable.findMany({
    where: { workspaceId, cancelledAt: null, dueDate: { lte: parseDateOnly(addDaysKey(today, 7)) } },
    select: { amountCents: true, dueDate: true, payments: { select: { principalCents: true, interestCents: true, fineCents: true, discountCents: true, reversedAt: true } } },
  });
  const overdue = { count: 0, cents: 0 };
  const soon = { count: 0, cents: 0 };
  for (const r of rows) {
    const left = r.amountCents - paidPrincipal(r.payments);
    if (left <= 0) continue;
    const bucket = dateKeySP(r.dueDate) < today ? overdue : soon;
    bucket.count += 1;
    bucket.cents += left;
  }
  return { overdue, soon };
}
