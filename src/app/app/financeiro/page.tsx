import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { chargeDisplayStatus } from "@/lib/labels";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { Banknote, MessageSquareText, Receipt as ReceiptIcon, PlusCircle } from "lucide-react";
import { CashflowChart } from "./_components/cashflow-chart";
import { FinanceTabs } from "./_components/finance-tabs";
import { isPastDue, startOfMonthSP, TZ } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const ctx = await requirePermission("financeiro.receber");
  const t = await getTranslations("finance.list");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const wsId = ctx.workspace.id;
  const now = new Date();

  const months = Array.from({ length: 6 }, (_, i) => startOfMonthSP(now, i - 5));

  const [charges, monthBuckets] = await Promise.all([
    db.charge.findMany({
      where: { workspaceId: wsId },
      include: { patient: true, paymentLink: true },
      orderBy: { dueDate: "desc" },
      take: 50,
    }),
    Promise.all(
      months.map(async (m) => {
        const next = startOfMonthSP(m, 1);
        const paid = await db.charge.aggregate({
          where: { workspaceId: wsId, status: "paid", paidAt: { gte: m, lt: next } },
          _sum: { amount: true },
        });
        const expected = await db.charge.aggregate({
          where: { workspaceId: wsId, dueDate: { gte: m, lt: next } },
          _sum: { amount: true },
        });
        return {
          label: monthLabel(f.locale, m),
          paid: paid._sum.amount ?? 0,
          expected: expected._sum.amount ?? 0,
        };
      }),
    ),
  ]);

  const totals = {
    paid: charges.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0),
    pending: charges.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0),
    overdue: charges
      .filter((c) => c.status === "pending" || c.status === "overdue")
      .filter((c) => isPastDue(c.dueDate, now))
      .reduce((s, c) => s + c.amount, 0),
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Banknote className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/financeiro/regua">
              <MessageSquareText className="h-4 w-4" /> {t("dunning")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/financeiro/novo">
              <PlusCircle className="h-4 w-4" /> {t("newCharge")}
            </Link>
          </Button>
        </div>
      </header>

      <FinanceTabs role={ctx} active="receivables" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("received")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-success-strong">{f.money(totals.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("open")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{f.money(totals.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{t("overdue")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning-strong">{f.money(totals.overdue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("cashflowTitle")}</CardTitle>
          <CardDescription>{t("cashflowDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CashflowChart data={monthBuckets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("recent")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t("patient")}</TH>
                <TH>{t("dueDate")}</TH>
                <TH className="text-right">{t("amount")}</TH>
                <TH>{t("method")}</TH>
                <TH>{t("status")}</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {charges.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-muted-foreground">
                    {t("empty")}
                  </TD>
                </TR>
              ) : (
                charges.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.patient.fullName}</TD>
                    <TD>{f.date(c.dueDate)}</TD>
                    <TD className="text-right">{f.money(c.amount)}</TD>
                    <TD>{label("paymentMethod", c.method)}</TD>
                    <TD>
                      <StatusBadge kind="charge" status={chargeDisplayStatus(c.status, c.dueDate, now)} />
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/financeiro/${c.id}`}>{t("openCharge")}</Link>
                      </Button>
                      {c.paymentLink ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/pay/${c.paymentLink.token}`} target="_blank" aria-label={t("openPaymentLink")}>
                            <ReceiptIcon className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
                      </div>
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

// "out/26", "Oct/26": mês abreviado no idioma da interface e ano com dois dígitos.
const monthLabel = (locale: string, d: Date) => {
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: TZ }).format(d).replace(".", "");
  const year = new Intl.DateTimeFormat(locale, { year: "2-digit", timeZone: TZ }).format(d);
  return `${month}/${year}`;
};
