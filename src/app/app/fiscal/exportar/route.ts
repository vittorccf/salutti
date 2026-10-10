import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getCurrentContext } from "@/lib/auth";
import { areaOf } from "@/lib/areas";
import { isValidCpf } from "@/lib/cpf";
import { canManagePayables, can } from "@/lib/permissions";
import { carneLeaoCsv, DEFAULT_OCCUPATION, receitaSaudeApplies } from "@/lib/tax";
import { getTranslations } from "@/i18n/server";
import { monthFiscal, receiptRow, yearCharges } from "../_data";

export const dynamic = "force-dynamic";

// CSV para importar no Carnê-Leão Web (Escrituração > Importar): rendimentos do mês (?mes=AAAA-MM) ou do ano
// (?ano=AAAA), com indicador "S" que gera os recibos da Receita Saúde. Só baixa: marcar como importado é uma ação
// à parte (markExportedAction). Pagamentos com recibo já exportado ficam de fora para não duplicar na Receita, a não
// ser com &todos=1.
export async function GET(req: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (ctx.support || !can(ctx, "fiscal.ver") || !canManagePayables(ctx)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ws = ctx.workspace;
  const occupation = ws.taxOccupation ?? DEFAULT_OCCUPATION[areaOf(ws.area)] ?? "";
  if (ws.taxRegime !== "pf" || !isValidCpf(ws.taxCpf) || !occupation) return NextResponse.json({ error: "perfil fiscal incompleto" }, { status: 400 });
  const url = new URL(req.url);
  const mes = url.searchParams.get("mes");
  const ano = url.searchParams.get("ano");
  const all = url.searchParams.get("todos") === "1";
  const t = await getTranslations("fiscal.carneLeao");
  let charges: Awaited<ReturnType<typeof yearCharges>>;
  let label: string;
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    charges = (await monthFiscal(ws.id, mes)).charges;
    label = mes;
  } else if (ano && /^\d{4}$/.test(ano)) {
    charges = await yearCharges(ws.id, Number(ano));
    label = ano;
  } else return NextResponse.json({ error: "mes ou ano" }, { status: 400 });
  if (!all) charges = charges.filter((c) => c.receipt?.receitaSaudeStatus !== "sent");

  const pro = await db.professional.findFirst({ where: { workspaceId: ws.id, active: true, councilNumber: { not: null } }, orderBy: { createdAt: "asc" }, select: { councilType: true, councilNumber: true } });
  const out = carneLeaoCsv(
    charges.map((c) => receiptRow(c, t("csvDescription"))),
    { occupation, professionalCpf: ws.taxCpf!, council: pro ? `${pro.councilType} ${pro.councilNumber}` : null, receitaSaude: receitaSaudeApplies(ws.area, ws.taxRegime) },
  );
  await recordAudit({ workspaceId: ws.id, userId: ctx.user.id, action: "fiscal.export", entity: "Workspace", entityId: ws.id, metadata: { period: label, rows: out.count, missing: out.missing.length, all } });
  return new Response(out.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carne-leao-${label}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
