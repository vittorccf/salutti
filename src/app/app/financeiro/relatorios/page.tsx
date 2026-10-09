import Link from "next/link";
import { Download } from "lucide-react";
import { dateKeySP } from "@/lib/dates";
import { getFormat, getTranslations } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FinanceTabs } from "../_components/finance-tabs";
import { requirePayables } from "../pagar/_lib";
import { reportViewsFor, yearReport, type ReportView } from "./_data";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string; year?: string }> }) {
  const ctx = await requirePayables();
  const sp = await searchParams;
  const views = reportViewsFor(ctx.workspace.accountType);
  const view: ReportView = (views as readonly string[]).includes(sp.view ?? "") ? (sp.view as ReportView) : "cashflow";
  const currentYear = Number(dateKeySP().slice(0, 4));
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= currentYear + 5 ? Number(sp.year) : currentYear;
  const [t, tg, f, r] = await Promise.all([getTranslations("payables.reports"), getTranslations("payables.groups"), getFormat(), yearReport(ctx.workspace.id, year)]);
  const money = (cents: number) => f.money(cents / 100);
  const monthLabel = (m: string) => new Intl.DateTimeFormat(f.locale, { month: "short", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`)).replace(".", "");
  const signed = (cents: number) => (cents < 0 ? "text-destructive-strong" : cents > 0 ? "text-success-strong" : "");
  const href = (v: string, y = year) => `/app/financeiro/relatorios?view=${v}&year=${y}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label={t("yearNav")} className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link href={href(view, year - 1)} aria-label={t("prevYear")}>
                ‹ {year - 1}
              </Link>
            </Button>
            <span className="px-2 text-sm font-semibold tabular-nums">{year}</span>
            <Button variant="ghost" size="sm" asChild>
              <Link href={href(view, year + 1)} aria-label={t("nextYear")}>
                {year + 1} ›
              </Link>
            </Button>
          </nav>
          <Button variant="outline" asChild>
            <a href={`/app/financeiro/relatorios/exportar?view=${view}&year=${year}`} download>
              <Download className="h-4 w-4" aria-hidden /> {t("export")}
            </a>
          </Button>
        </div>
      </header>

      <FinanceTabs role={ctx} active="reports" />

      <nav aria-label={t("viewNav")} className="flex flex-wrap gap-2">
        {views.map((v) => (
          <Link
            key={v}
            href={href(v)}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              view === v ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      {view === "cashflow" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("views.cashflow")}</CardTitle>
            <CardDescription>{t("cashflowDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("month")}</TH>
                  <TH className="text-right">{t("inPaid")}</TH>
                  <TH className="text-right">{t("outPaid")}</TH>
                  <TH className="text-right">{t("net")}</TH>
                  <TH className="text-right">{t("inOpen")}</TH>
                  <TH className="text-right">{t("outOpen")}</TH>
                  <TH className="text-right">{t("accumulatedProjected")}</TH>
                </TR>
              </THead>
              <TBody>
                {r.cashflow.map((m) => (
                  <TR key={m.month} className={m.future ? "text-muted-foreground" : ""}>
                    <TD className="capitalize">{monthLabel(m.month)}</TD>
                    <TD className="text-right tabular-nums">{money(m.inPaid)}</TD>
                    <TD className="text-right tabular-nums">{money(m.outPaid)}</TD>
                    <TD className={cn("text-right tabular-nums font-medium", signed(m.net))}>{money(m.net)}</TD>
                    <TD className="text-right tabular-nums">{money(m.inOpen)}</TD>
                    <TD className="text-right tabular-nums">{money(m.outOpen)}</TD>
                    <TD className={cn("text-right tabular-nums", signed(m.accumulatedProjected))}>{money(m.accumulatedProjected)}</TD>
                  </TR>
                ))}
                <TR className="font-semibold">
                  <TD>{t("total")}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.reduce((s, m) => s + m.inPaid, 0))}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.reduce((s, m) => s + m.outPaid, 0))}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.reduce((s, m) => s + m.net, 0))}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.reduce((s, m) => s + m.inOpen, 0))}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.reduce((s, m) => s + m.outOpen, 0))}</TD>
                  <TD className="text-right tabular-nums">{money(r.cashflow.at(-1)?.accumulatedProjected ?? 0)}</TD>
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {view === "dre" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("views.dre")}</CardTitle>
            <CardDescription>{t("dreDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH className="sticky left-0 bg-card">{t("line")}</TH>
                  {r.dre.months.map((m) => (
                    <TH key={m} className="text-right capitalize">
                      {monthLabel(m)}
                    </TH>
                  ))}
                  <TH className="text-right">{t("total")}</TH>
                </TR>
              </THead>
              <TBody>
                <TR className="font-medium">
                  <TD className="sticky left-0 bg-card">{t("revenue")}</TD>
                  {r.dre.revenue.map((v, i) => (
                    <TD key={i} className="text-right tabular-nums">
                      {money(v)}
                    </TD>
                  ))}
                  <TD className="text-right tabular-nums">{money(r.dre.revenue.reduce((a, b) => a + b, 0))}</TD>
                </TR>
                {r.dre.groups.map((g) => (
                  <TR key={g.group} className="text-muted-foreground">
                    <TD className="sticky left-0 bg-card">(-) {tg(g.group)}</TD>
                    {g.values.map((v, i) => (
                      <TD key={i} className="text-right tabular-nums">
                        {money(v)}
                      </TD>
                    ))}
                    <TD className="text-right tabular-nums">{money(g.values.reduce((a, b) => a + b, 0))}</TD>
                  </TR>
                ))}
                <TR className="font-medium">
                  <TD className="sticky left-0 bg-card">{t("expenses")}</TD>
                  {r.dre.expenses.map((v, i) => (
                    <TD key={i} className="text-right tabular-nums">
                      {money(v)}
                    </TD>
                  ))}
                  <TD className="text-right tabular-nums">{money(r.totalExpenses)}</TD>
                </TR>
                <TR className="font-semibold">
                  <TD className="sticky left-0 bg-card">{t("result")}</TD>
                  {r.dre.result.map((v, i) => (
                    <TD key={i} className={cn("text-right tabular-nums", signed(v))}>
                      {money(v)}
                    </TD>
                  ))}
                  <TD className={cn("text-right tabular-nums", signed(r.dre.result.reduce((a, b) => a + b, 0)))}>{money(r.dre.result.reduce((a, b) => a + b, 0))}</TD>
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {view === "categories" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("byCategory")}</CardTitle>
              <CardDescription>{t("byCategoryDescription", { total: money(r.totalExpenses) })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.categories.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
              {r.categories.map((c) => {
                const pct = r.totalExpenses ? (c.cents / r.totalExpenses) * 100 : 0;
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span>
                        {c.name} <span className="text-xs text-muted-foreground">· {tg(c.group)}</span>
                      </span>
                      <span className="tabular-nums">
                        {money(c.cents)} <span className="text-xs text-muted-foreground">({f.percent(pct)})</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" aria-hidden>
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(pct, 1)}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("bySupplier")}</CardTitle>
              <CardDescription>{t("bySupplierDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {r.suppliers.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <Table>
                  <TBody>
                    {r.suppliers.map((s) => (
                      <TR key={s.name}>
                        <TD>{s.name}</TD>
                        <TD className="text-right tabular-nums">{money(s.cents)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "livro" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("views.livro")}</CardTitle>
              <CardDescription>{t("livroDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>{t("month")}</TH>
                    <TH className="text-right">{t("income")}</TH>
                    <TH className="text-right">{t("deductibleExpenses")}</TH>
                    <TH className="text-right">{t("carriedIn")}</TH>
                    <TH className="text-right">{t("deducted")}</TH>
                    <TH className="text-right">{t("carriedOut")}</TH>
                    <TH className="text-right">{t("taxable")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.livro.map((m) => (
                    <TR key={m.month}>
                      <TD className="capitalize">{monthLabel(m.month)}</TD>
                      <TD className="text-right tabular-nums">{money(m.incomeCents)}</TD>
                      <TD className="text-right tabular-nums">{money(m.expensesCents)}</TD>
                      <TD className="text-right tabular-nums">{money(m.carriedInCents)}</TD>
                      <TD className="text-right tabular-nums">{money(m.deductedCents)}</TD>
                      <TD className="text-right tabular-nums">{money(m.carriedOutCents)}</TD>
                      <TD className="text-right tabular-nums font-medium">{money(m.taxableCents)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("livroEntries")}</CardTitle>
              <CardDescription>{t("livroEntriesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {r.livroEntries.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("livroEmpty")}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("date")}</TH>
                      <TH>{t("history")}</TH>
                      <TH>{t("category")}</TH>
                      <TH>{t("document")}</TH>
                      <TH className="text-right">{t("value")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {r.livroEntries.map((e, i) => (
                      <TR key={i}>
                        <TD className="tabular-nums">{f.date(`${e.date}T12:00:00`)}</TD>
                        <TD>
                          <Link href={`/app/financeiro/pagar/${e.payableId}`} className="text-brand underline-offset-4 hover:underline">
                            {e.description}
                          </Link>
                          {e.supplier ? <span className="text-muted-foreground"> · {e.supplier}</span> : null}
                        </TD>
                        <TD className="text-muted-foreground">{e.category}</TD>
                        <TD className="text-muted-foreground">{e.document || "-"}</TD>
                        <TD className="text-right tabular-nums">{money(e.cents)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {r.livroLimited ? (
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
              {t("livroLimited")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("livroDisclaimer")}</p>
        </>
      ) : null}
    </div>
  );
}
