import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { dateKeySP } from "@/lib/dates";
import { centsToCsv, toCsv } from "@/lib/payables";
import { getTranslations } from "@/i18n/server";
import { requirePayables } from "../../pagar/_lib";
import { reportViewsFor, yearReport, type ReportView } from "../_data";

// CSV do relatório aberto na tela (mesmo ano e visão).
export const GET = async (req: Request) => {
  const ctx = await requirePayables();
  const url = new URL(req.url);
  const views = reportViewsFor(ctx.workspace.accountType);
  const view = (views as readonly string[]).includes(url.searchParams.get("view") ?? "") ? (url.searchParams.get("view") as ReportView) : "cashflow";
  const currentYear = Number(dateKeySP().slice(0, 4));
  const y = Number(url.searchParams.get("year"));
  const year = y >= 2000 && y <= currentYear + 5 ? y : currentYear;
  const [t, tg] = await Promise.all([getTranslations("payables.reports"), getTranslations("payables.groups")]);
  const r = await yearReport(ctx.workspace.id, year);
  const c = centsToCsv;

  let rows: (string | number)[][];
  if (view === "cashflow") {
    rows = [
      [t("month"), t("inPaid"), t("outPaid"), t("net"), t("inOpen"), t("outOpen"), t("accumulatedProjected")],
      ...r.cashflow.map((m) => [m.month, c(m.inPaid), c(m.outPaid), c(m.net), c(m.inOpen), c(m.outOpen), c(m.accumulatedProjected)]),
    ];
  } else if (view === "dre") {
    rows = [
      [t("line"), ...r.dre.months, t("total")],
      [t("revenue"), ...r.dre.revenue.map(c), c(r.dre.revenue.reduce((a, b) => a + b, 0))],
      ...r.dre.groups.map((g) => [`(-) ${tg(g.group)}`, ...g.values.map(c), c(g.values.reduce((a, b) => a + b, 0))]),
      [t("expenses"), ...r.dre.expenses.map(c), c(r.totalExpenses)],
      [t("result"), ...r.dre.result.map(c), c(r.dre.result.reduce((a, b) => a + b, 0))],
    ];
  } else if (view === "categories") {
    rows = [[t("category"), t("group"), t("value")], ...r.categories.map((x) => [x.name, tg(x.group), c(x.cents)])];
  } else {
    rows = [
      [t("month"), t("income"), t("deductibleExpenses"), t("carriedIn"), t("deducted"), t("carriedOut"), t("taxable")],
      ...r.livro.map((m) => [m.month, c(m.incomeCents), c(m.expensesCents), c(m.carriedInCents), c(m.deductedCents), c(m.carriedOutCents), c(m.taxableCents)]),
      [],
      [t("date"), t("history"), t("supplier"), t("category"), t("document"), t("value")],
      ...r.livroEntries.map((e) => [e.date, e.description, e.supplier, e.category, e.document, c(e.cents)]),
    ];
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "finance.report-export", entity: "Workspace", entityId: ctx.workspace.id, metadata: { view, year } });
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="salutti-${view}-${year}.csv"`,
      "cache-control": "private, no-store",
    },
  });
};
