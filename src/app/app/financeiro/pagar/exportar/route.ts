import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { dateKeySP } from "@/lib/dates";
import { centsToCsv, paymentOutflow, remainingCents, toCsv } from "@/lib/payables";
import { getTranslations } from "@/i18n/server";
import { listPayables, requirePayables, statusOf } from "../_lib";

// Exporta a lista com os mesmos filtros da tela (CSV com ";" para abrir no Excel em português).
export const GET = async (req: Request) => {
  const ctx = await requirePayables();
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const [t, ts, tm] = await Promise.all([getTranslations("payables.csv"), getTranslations("payables.status"), getTranslations("payables.methods")]);
  const { rows } = await listPayables(ctx.workspace.id, params);
  const today = dateKeySP();
  const csv = toCsv([
    [t("dueDate"), t("competence"), t("description"), t("supplier"), t("category"), t("costCenter"), t("document"), t("amount"), t("paid"), t("outflow"), t("remaining"), t("status"), t("method"), t("lastPayment"), t("deductible")],
    ...rows.map((r) => {
      const valid = r.payments.filter((p) => !p.reversedAt);
      const last = valid.map((p) => p.paidAt).sort((a, b) => b.getTime() - a.getTime())[0];
      const s = statusOf(r, today);
      return [
        dateKeySP(r.dueDate),
        dateKeySP(r.competenceDate).slice(0, 7),
        r.installmentTotal ? `${r.description} (${r.seriesIndex}/${r.installmentTotal})` : r.description,
        r.supplier?.name ?? "",
        r.category.name,
        r.costCenter ?? "",
        r.documentNumber ?? "",
        centsToCsv(r.amountCents),
        centsToCsv(valid.reduce((sum, p) => sum + p.principalCents, 0)),
        centsToCsv(valid.reduce((sum, p) => sum + paymentOutflow(p), 0)),
        centsToCsv(s === "cancelled" ? 0 : remainingCents({ ...r, dueDate: dateKeySP(r.dueDate) })),
        ts(s),
        r.method ? tm(r.method) : "",
        last ? dateKeySP(last) : "",
        r.deductible ? t("yes") : t("no"),
      ];
    }),
  ]);
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "payable.export", entity: "Payable", entityId: "csv", metadata: { rows: rows.length } });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contas-a-pagar-${today}.csv"`,
      "cache-control": "private, no-store",
    },
  });
};
