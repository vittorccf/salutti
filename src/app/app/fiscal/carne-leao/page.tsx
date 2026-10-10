import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { dateKeySP } from "@/lib/dates";
import { addMonthsKey } from "@/lib/payables";
import { isValidCpf } from "@/lib/cpf";
import { areaOf } from "@/lib/areas";
import { canManagePayables, requirePermission } from "@/lib/permissions";
import { carneLeao, carneLeaoDue, DEFAULT_OCCUPATION, DEPENDENT_MONTHLY, receitaSaudeApplies, SIMPLIFIED_MONTHLY } from "@/lib/tax";
import { getFormat, getTranslations } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { monthFiscal } from "../_data";
import { markExportedAction } from "../_actions";

export const dynamic = "force-dynamic";

// Apuração mensal do carnê-leão (estimativa para conferir no Carnê-Leão Web): rendimentos recebidos de pessoas físicas,
// livro-caixa e INSS pagos no mês, deduções legais × desconto simplificado, tabela 2026 e redutor.
export default async function CarneLeaoPage({ searchParams }: { searchParams: { mes?: string; importados?: string } }) {
  const ctx = await requirePermission("fiscal.ver");
  const current = dateKeySP().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mes ?? "") && searchParams.mes! <= current ? searchParams.mes! : addMonthsKey(`${current}-01`, -1).slice(0, 7);
  const prev = addMonthsKey(`${month}-01`, -1).slice(0, 7);
  const next = addMonthsKey(`${month}-01`, 1).slice(0, 7);
  const [t, f, data] = await Promise.all([getTranslations("fiscal.carneLeao"), getFormat(), monthFiscal(ctx.workspace.id, month)]);
  const r = carneLeao({ income: data.income, livroCaixa: data.livroCaixa, inss: data.inss, dependents: ctx.workspace.taxDependents });
  const due = carneLeaoDue(month);
  const ws = ctx.workspace;
  const occupation = ws.taxOccupation ?? DEFAULT_OCCUPATION[areaOf(ws.area)] ?? "";
  const manage = canManagePayables(ctx) && !ctx.support;
  // O que falta para o arquivo ser aceito pelo Carnê-Leão Web (a rota recusa nos mesmos casos).
  const blocker = ws.taxRegime !== "pf" ? t("blockRegime") : !isValidCpf(ws.taxCpf) ? t("needsCpf") : !occupation ? t("needsOccupation") : null;
  const pending = data.charges.filter((c) => c.receipt?.receitaSaudeStatus === "queued").length;
  const imported = /^\d+$/.test(searchParams.importados ?? "") ? Number(searchParams.importados) : null;
  const monthLabel = f.monthYear(`${month}-15T12:00:00Z`);
  const row = (label: string, value: string, strong = false) => (
    <p className={`flex justify-between gap-3 ${strong ? "border-t pt-2 text-base font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );

  return (
    <div className="space-y-6">
      <Link href="/app/fiscal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title", { month: monthLabel })}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <nav aria-label={t("monthNav")} className="flex items-center gap-1">
          <Button variant="outline" size="icon" asChild>
            <Link href={`/app/fiscal/carne-leao?mes=${prev}`} aria-label={t("prev")}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          {next <= current ? (
            <Button variant="outline" size="icon" asChild>
              <Link href={`/app/fiscal/carne-leao?mes=${next}`} aria-label={t("next")}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </nav>
      </header>

      <div role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">{t("disclaimer")}</div>
      {imported !== null ? (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">{t("imported", { count: imported })}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("calcTitle")}</CardTitle>
            <CardDescription>{r.useSimplified ? t("usingSimplified") : t("usingLegal")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {row(t("income", { count: data.charges.length }), f.money(r.income))}
            <div className="space-y-1 rounded-lg border p-3">
              <p className="text-overline text-muted-foreground">{t("bookTitle")}</p>
              {row(t("bookExpenses"), f.money(data.expenses))}
              {data.carriedIn ? row(t("bookCarriedIn"), f.money(data.carriedIn)) : null}
              {row(t("bookUsed"), f.money(r.livroCaixa))}
              {data.carriedOut ? row(t("bookCarriedOut"), f.money(data.carriedOut)) : null}
            </div>
            <div className="space-y-1 rounded-lg border p-3">
              <p className="text-overline text-muted-foreground">{t("legalTitle")}</p>
              {row(t("inss"), f.money(data.inss))}
              {row(t("dependents", { count: ctx.workspace.taxDependents, each: f.money(DEPENDENT_MONTHLY) }), f.money(ctx.workspace.taxDependents * DEPENDENT_MONTHLY))}
              {row(t("legalTotal"), f.money(r.legal))}
              {row(t("simplified", { value: f.money(SIMPLIFIED_MONTHLY) }), f.money(r.simplified))}
            </div>
            {row(t("deductions"), `- ${f.money(r.deductions)}`)}
            {row(t("base"), f.money(r.base))}
            {row(t("gross"), f.money(r.gross))}
            {row(t("reduction"), `- ${f.money(r.reduction)}`)}
            {row(t("tax"), f.money(r.tax), true)}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("darfTitle")}</CardTitle>
              <CardDescription>{t("darfDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-2xl font-semibold tabular-nums">{f.money(r.tax)}</p>
              <p>{t("darfDue", { date: f.date(`${due}T12:00:00Z`) })}</p>
              {r.tax > 0 && r.tax < 10 ? <p className="text-muted-foreground">{t("under10")}</p> : null}
              {r.tax === 0 ? <Badge variant="success">{t("noTax")}</Badge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("exportTitle")}</CardTitle>
              <CardDescription>{t("exportDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!manage ? (
                <p className="text-muted-foreground">{t("onlyFinance")}</p>
              ) : blocker ? (
                <p className="text-warning-strong">
                  {blocker}{" "}
                  <Link href="/app/fiscal#perfil" className="underline underline-offset-4">
                    {t("openProfile")}
                  </Link>
                </p>
              ) : (
                <>
                  <Button variant="outline" asChild>
                    <a href={`/app/fiscal/exportar?mes=${month}`} download>
                      <Download className="h-4 w-4" aria-hidden /> {t("exportCsv")}
                    </a>
                  </Button>
                  <p className="text-muted-foreground">{receitaSaudeApplies(ws.area, ws.taxRegime) ? t("exportOnlyPending") : t("exportNoReceitaSaude")}</p>
                  {pending ? (
                    <form action={markExportedAction} className="space-y-1">
                      <input type="hidden" name="mes" value={month} />
                      <Button type="submit" variant="secondary">{t("markImported", { count: pending })}</Button>
                      <p className="text-xs text-muted-foreground">{t("markImportedHint")}</p>
                    </form>
                  ) : null}
                </>
              )}
              {data.missingCpf.length ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="font-medium text-warning-strong">{t("missingCpf", { count: data.missingCpf.length })}</p>
                  <ul className="mt-1 space-y-0.5">
                    {data.missingCpf.slice(0, 8).map((c) => (
                      <li key={c.id}>
                        <Link href={`/app/pacientes/${c.patient.id}/editar`} className="text-brand underline-offset-4 hover:underline">
                          {c.patient.fullName}
                        </Link>{" "}
                        · {f.money(c.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
