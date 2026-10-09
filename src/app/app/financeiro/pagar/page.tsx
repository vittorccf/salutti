import Link from "next/link";
import { Download, FolderTree, PlusCircle, Repeat, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP, parseDateOnly, startOfMonthSP } from "@/lib/dates";
import { addDaysKey, paidPrincipal, paymentOutflow, PAYMENT_METHODS, remainingCents } from "@/lib/payables";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FinanceTabs } from "../_components/finance-tabs";
import { PayableStatusBadge } from "./_components/payable-status";
import { bulkPayAction } from "./_actions";
import { ensureDefaultCategories, LIST_FILTERS, listPayables, requirePayables, statusOf, type ListParams } from "./_lib";

export const dynamic = "force-dynamic";

export default async function PayablesPage({ searchParams }: { searchParams: Promise<ListParams> }) {
  const ctx = await requirePayables();
  const wsId = ctx.workspace.id;
  const params = await searchParams;
  const [t, ts, tm, f] = await Promise.all([
    getTranslations("payables.list"),
    getTranslations("payables.status"),
    getTranslations("payables.methods"),
    getFormat(),
  ]);
  await ensureDefaultCategories(ctx.workspace);
  const today = dateKeySP();
  const in7 = addDaysKey(today, 7);
  const monthStart = startOfMonthSP();

  const [{ status, rows, truncated }, upcoming, paidMonth, categories, suppliers] = await Promise.all([
    listPayables(wsId, params),
    db.payable.findMany({
      where: { workspaceId: wsId, cancelledAt: null, dueDate: { lte: parseDateOnly(in7) } },
      select: { amountCents: true, dueDate: true, payments: true },
    }),
    db.payablePayment.findMany({ where: { workspaceId: wsId, reversedAt: null, paidAt: { gte: monthStart } } }),
    db.financeCategory.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.supplier.findMany({ where: { workspaceId: wsId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Resumo: vencidas, vencem hoje e nos próximos 7 dias (saldo em aberto) e o que saiu no mês.
  const sum = (filter: (due: string) => boolean) => {
    const open = upcoming.filter((p) => paidPrincipal(p.payments) < p.amountCents && filter(dateKeySP(p.dueDate)));
    return { cents: open.reduce((s, p) => s + remainingCents({ ...p, dueDate: dateKeySP(p.dueDate) }), 0), count: open.length };
  };
  const cards = [
    { key: "overdue", ...sum((d) => d < today), tone: "text-destructive-strong", href: "?status=overdue" },
    { key: "dueToday", ...sum((d) => d === today), tone: "text-warning-strong", href: `?status=open&from=${today}&to=${today}` },
    { key: "next7", ...sum((d) => d > today && d <= in7), tone: "", href: `?status=open&from=${addDaysKey(today, 1)}&to=${in7}` },
    { key: "paidMonth", cents: paidMonth.reduce((s, p) => s + paymentOutflow(p), 0), count: paidMonth.length, tone: "text-success-strong", href: "?status=paid" },
  ];

  const totalAmount = rows.reduce((s, r) => s + r.amountCents, 0);
  const totalRemaining = rows.filter((r) => !r.cancelledAt).reduce((s, r) => s + remainingCents({ ...r, dueDate: dateKeySP(r.dueDate) }), 0);
  const exportQuery = new URLSearchParams(Object.entries({ ...params, status }).filter(([, v]) => v) as [string, string][]).toString();
  const payable = rows.filter((r) => !["paid", "cancelled"].includes(statusOf(r, today)));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/financeiro/pagar/fornecedores">
              <Truck className="h-4 w-4" aria-hidden /> {t("suppliers")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app/financeiro/pagar/categorias">
              <FolderTree className="h-4 w-4" aria-hidden /> {t("categories")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/financeiro/pagar/nova">
              <PlusCircle className="h-4 w-4" aria-hidden /> {t("new")}
            </Link>
          </Button>
        </div>
      </header>

      <FinanceTabs role={ctx} active="payables" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{t(`cards.${c.key}`)}</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${c.tone}`}>{f.money(c.cents / 100)}</p>
                <p className="text-xs text-muted-foreground">{t("cardCount", { count: c.count })}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <form method="get" className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label={t("filters")}>
        <div className="space-y-1.5">
          <Label htmlFor="f-status">{t("filterStatus")}</Label>
          <Select id="f-status" name="status" defaultValue={status}>
            {LIST_FILTERS.map((s) => (
              <option key={s} value={s}>
                {t(`filter.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from">{t("from")}</Label>
          <Input id="f-from" name="from" type="date" defaultValue={params.from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">{t("to")}</Label>
          <Input id="f-to" name="to" type="date" defaultValue={params.to ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-category">{t("category")}</Label>
          <Select id="f-category" name="category" defaultValue={params.category ?? ""}>
            <option value="">{t("any")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-supplier">{t("supplier")}</Label>
          <Select id="f-supplier" name="supplier" defaultValue={params.supplier ?? ""}>
            <option value="">{t("any")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-q">{t("search")}</Label>
          <Input id="f-q" name="q" type="search" defaultValue={params.q ?? ""} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 lg:col-span-6">
          <Button variant="ghost" asChild>
            <Link href="/app/financeiro/pagar">{t("clear")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/app/financeiro/pagar/exportar?${exportQuery}`} download>
              <Download className="h-4 w-4" aria-hidden /> {t("export")}
            </a>
          </Button>
          <Button type="submit">{t("apply")}</Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild>
              <Link href="/app/financeiro/pagar/nova">{t("new")}</Link>
            </Button>
          }
        />
      ) : (
        <ActionForm action={bulkPayAction} className="space-y-3">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">
                      <span className="sr-only">{t("select")}</span>
                    </TH>
                    <TH>{t("dueDate")}</TH>
                    <TH>{t("descriptionCol")}</TH>
                    <TH>{t("supplier")}</TH>
                    <TH>{t("category")}</TH>
                    <TH className="text-right">{t("amount")}</TH>
                    <TH className="text-right">{t("remaining")}</TH>
                    <TH>{t("statusCol")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => {
                    const s = statusOf(r, today);
                    const remaining = remainingCents({ ...r, dueDate: dateKeySP(r.dueDate) });
                    return (
                      <TR key={r.id}>
                        <TD>
                          {s !== "paid" && s !== "cancelled" ? (
                            <input type="checkbox" name="ids" value={r.id} aria-label={t("selectRow", { description: r.description })} className="h-4 w-4 accent-primary" />
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap tabular-nums">{f.date(r.dueDate)}</TD>
                        <TD>
                          <Link href={`/app/financeiro/pagar/${r.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                            {r.description}
                          </Link>
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            {r.installmentTotal ? t("installment", { index: r.seriesIndex ?? 1, total: r.installmentTotal }) : null}
                            {r.frequency && !r.installmentTotal ? (
                              <>
                                <Repeat className="h-3 w-3" aria-hidden />
                                <span className="sr-only">{t("recurring")}</span>
                              </>
                            ) : null}
                          </span>
                        </TD>
                        <TD className="text-muted-foreground">{r.supplier?.name ?? "-"}</TD>
                        <TD className="text-muted-foreground">{r.category.name}</TD>
                        <TD className="text-right tabular-nums">{f.money(r.amountCents / 100)}</TD>
                        <TD className="text-right tabular-nums">{s === "cancelled" ? "-" : f.money(remaining / 100)}</TD>
                        <TD>
                          <PayableStatusBadge status={s} label={ts(s)} />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {t("totals", { count: rows.length, amount: f.money(totalAmount / 100), remaining: f.money(totalRemaining / 100) })}
              {truncated ? ` ${t("truncated")}` : ""}
            </p>
            {payable.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="bulk-date" className="text-xs">
                    {t("bulkDate")}
                  </Label>
                  <Input id="bulk-date" name="paidAt" type="date" max={today} defaultValue={today} className="h-9 w-40" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bulk-method" className="text-xs">
                    {t("bulkMethod")}
                  </Label>
                  <Select id="bulk-method" name="method" defaultValue="" className="h-9 w-44">
                    <option value="">{t("bulkKeepMethod")}</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {tm(m)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" variant="outline" size="sm">
                  {t("bulkPay")}
                </Button>
              </div>
            ) : null}
          </div>
        </ActionForm>
      )}
    </div>
  );
}
