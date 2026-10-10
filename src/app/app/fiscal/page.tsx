import Link from "next/link";
import { Building2, Calculator, CalendarClock, Download, FileSignature, Printer, Receipt as ReceiptIcon, Scale } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { addMonthsKey } from "@/lib/payables";
import { canManagePayables, requirePermission } from "@/lib/permissions";
import { areaOf } from "@/lib/areas";
import { carneLeao, DEFAULT_OCCUPATION, obligationsFor, receitaSaudeApplies, TAX_REGIMES, type TaxRegime } from "@/lib/tax";
import { formatCpf, isValidCpf } from "@/lib/cpf";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { saveFiscalProfileAction } from "./_actions";
import { monthFiscal } from "./_data";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const ctx = await requirePermission("fiscal.ver");
  const ws = ctx.workspace;
  const regime = (TAX_REGIMES as readonly string[]).includes(ws.taxRegime) ? (ws.taxRegime as TaxRegime) : "pf";
  const today = dateKeySP();
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonthsKey(`${thisMonth}-01`, -1).slice(0, 7);
  const [t, f, receipts, invoices, last, pending, professionals] = await Promise.all([
    getTranslations("fiscal"),
    getFormat(),
    db.receipt.findMany({ where: { workspaceId: ws.id }, include: { patient: { select: { fullName: true } } }, orderBy: { issuedAt: "desc" }, take: 30 }),
    db.invoice.findMany({ where: { workspaceId: ws.id }, include: { patient: { select: { fullName: true } } }, orderBy: { issuedAt: "desc" }, take: 30 }),
    regime === "pf" ? monthFiscal(ws.id, lastMonth) : Promise.resolve(null),
    db.receipt.count({ where: { workspaceId: ws.id, receitaSaudeStatus: "queued" } }),
    db.professional.count({ where: { workspaceId: ws.id, active: true } }),
  ]);
  const rs = receitaSaudeApplies(ws.area, regime);
  const estimate = last ? carneLeao({ income: last.income, livroCaixa: last.livroCaixa, inss: last.inss, dependents: ws.taxDependents }) : null;
  // Obrigações do mês passado (vencem neste mês) e deste mês (vencem no próximo), as que ainda não venceram.
  const due = (m: string) => obligationsFor(regime, m, { receitaSaude: rs }).map((o) => ({ ...o, month: m }));
  const obligations = [...due(lastMonth), ...due(thisMonth)]
    .filter((o) => o.dueKey >= today)
    .slice(0, 5);
  const edit = canManagePayables(ctx) && !ctx.support;
  const occupationDefault = ws.taxOccupation ?? DEFAULT_OCCUPATION[areaOf(ws.area)] ?? "";
  const exportReady = edit && regime === "pf" && isValidCpf(ws.taxCpf) && !!occupationDefault;
  const monthLabel = (m: string) => f.monthYear(`${m}-15T12:00:00Z`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-brand" aria-hidden /> {t("agenda.title")}
            </CardTitle>
            <CardDescription>{t(`agenda.description.${regime}`)}</CardDescription>
          </CardHeader>
          <CardContent>
            {obligations.length ? (
              <ul className="divide-y rounded-lg border">
                {obligations.map((o) => (
                  <li key={`${o.key}-${o.month}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{t(`agenda.items.${o.key}`)}</span>
                      <span className="text-muted-foreground"> · {t("agenda.ofMonth", { month: monthLabel(o.month) })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {o.key === "carneLeao" && o.month === lastMonth && estimate ? <span className="tabular-nums">{f.money(estimate.tax)}</span> : null}
                      <Badge variant={o.dueKey === today ? "warning" : "muted"}>{t("agenda.due", { date: f.date(`${o.dueKey}T12:00:00Z`) })}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("agenda.none")}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {regime === "pf" ? (
                <>
                  <Button size="sm" asChild>
                    <Link href={`/app/fiscal/carne-leao?mes=${lastMonth}`}>
                      <Calculator className="h-4 w-4" aria-hidden /> {t("links.carneLeao")}
                    </Link>
                  </Button>
                  {exportReady ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/app/fiscal/exportar?mes=${lastMonth}`} download>
                        <Download className="h-4 w-4" aria-hidden /> {t("links.export", { month: monthLabel(lastMonth) })}
                      </a>
                    </Button>
                  ) : null}
                </>
              ) : null}
              {regime === "simples" ? (
                <Button size="sm" variant="outline" asChild>
                  <Link href="/app/fiscal/fator-r">
                    <Scale className="h-4 w-4" aria-hidden /> {t("links.factorR")}
                  </Link>
                </Button>
              ) : null}
            </div>
            {regime === "pf" && professionals > 1 ? <p className="mt-3 text-sm text-warning-strong">{t("agenda.clinicWarning", { count: professionals })}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">{t("agenda.disclaimer")}</p>
          </CardContent>
        </Card>

        <Card id="perfil" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("profile.title")}</CardTitle>
            <CardDescription>{t("profile.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {edit ? (
              <ActionForm action={saveFiscalProfileAction} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="taxRegime">{t("profile.regime")}</Label>
                  <Select id="taxRegime" name="taxRegime" defaultValue={regime}>
                    {TAX_REGIMES.map((r) => (
                      <option key={r} value={r}>
                        {t(`profile.regimes.${r}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="taxCpf">{t("profile.cpf")}</Label>
                  <Input id="taxCpf" name="taxCpf" inputMode="numeric" defaultValue={ws.taxCpf ? formatCpf(ws.taxCpf) : ""} placeholder="000.000.000-00" aria-describedby="taxCpf-hint" />
                  <p id="taxCpf-hint" className="text-xs text-muted-foreground">
                    {t("profile.cpfHint")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="taxOccupation">{t("profile.occupation")}</Label>
                    <Input id="taxOccupation" name="taxOccupation" inputMode="numeric" maxLength={6} defaultValue={occupationDefault} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxDependents">{t("profile.dependents")}</Label>
                    <Input id="taxDependents" name="taxDependents" type="number" min={0} max={20} defaultValue={ws.taxDependents} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t("profile.occupationHint")}</p>
                <Button type="submit" variant="outline">
                  {t("profile.save")}
                </Button>
              </ActionForm>
            ) : (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("profile.regime")}</dt>
                  <dd>{t(`profile.regimes.${regime}`)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("profile.occupation")}</dt>
                  <dd>{occupationDefault || "-"}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {rs ? (
        <p role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-strong">{t("receitaSaude.notice", { count: pending })}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5 text-brand" aria-hidden /> {t("receipts.title")}
            </CardTitle>
            <CardDescription>{t("receipts.description")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("receipts.number")}</TH>
                  <TH>{t("receipts.patient")}</TH>
                  <TH className="text-right">{t("receipts.amount")}</TH>
                  <TH>{t("receipts.status")}</TH>
                  <TH>
                    <span className="sr-only">{t("receipts.print")}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {receipts.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="text-center text-muted-foreground">
                      {t("receipts.empty")}
                    </TD>
                  </TR>
                ) : (
                  receipts.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono">{r.receiptNumber}</TD>
                      <TD>{r.patient.fullName}</TD>
                      <TD className="text-right tabular-nums">{f.money(r.amount)}</TD>
                      <TD>{r.receitaSaudeStatus ? <StatusBadge kind="receitaSaude" status={r.receitaSaudeStatus} /> : <span className="text-muted-foreground">-</span>}</TD>
                      <TD>
                        <Link href={`/impressao/recibo/${r.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-brand underline-offset-4 hover:underline" aria-label={t("receipts.printOf", { number: r.receiptNumber })}>
                          <Printer className="h-3.5 w-3.5" aria-hidden /> {t("receipts.print")}
                        </Link>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand" aria-hidden /> {t("nfse.title")}
            </CardTitle>
            <CardDescription>{t("nfse.description")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("receipts.number")}</TH>
                  <TH>{t("receipts.patient")}</TH>
                  <TH className="text-right">{t("receipts.amount")}</TH>
                  <TH>{t("receipts.status")}</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("nfse.empty")}
                    </TD>
                  </TR>
                ) : (
                  invoices.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono">{i.invoiceNumber}</TD>
                      <TD>{i.patient.fullName}</TD>
                      <TD className="text-right tabular-nums">{f.money(i.amount)}</TD>
                      <TD>
                        <StatusBadge kind="invoice" status={i.issStatus} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
            <p className="px-6 py-3 text-xs text-muted-foreground">{t("nfse.sandbox")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
