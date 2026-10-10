import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { dateKeySP } from "@/lib/dates";
import { addMonthsKey } from "@/lib/payables";
import { requirePermission } from "@/lib/permissions";
import { factorR } from "@/lib/tax";
import { getFormat, getTranslations } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { factorRData } from "../_data";

export const dynamic = "force-dynamic";

// Fator R do Simples Nacional: folha ÷ receita nos 12 meses anteriores ao mês de apuração. Serviços de saúde (psicologia,
// odontologia) com 28% ou mais vão para o Anexo III; abaixo, Anexo V.
export default async function FactorRPage() {
  const ctx = await requirePermission("fiscal.ver");
  const lastMonth = addMonthsKey(`${dateKeySP().slice(0, 7)}-01`, -1).slice(0, 7);
  const [t, f, data] = await Promise.all([getTranslations("fiscal.factorR"), getFormat(), factorRData(ctx.workspace.id, lastMonth)]);
  const r = factorR(data.payroll12, data.revenue12);
  const from = addMonthsKey(`${lastMonth}-01`, -11);

  return (
    <div className="space-y-6">
      <Link href="/app/fiscal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <header>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description", { from: f.monthYear(`${from.slice(0, 7)}-15T12:00:00Z`), to: f.monthYear(`${lastMonth}-15T12:00:00Z`) })}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("revenue"), value: f.money(data.revenue12) },
          { label: t("payroll"), value: f.money(data.payroll12) },
          { label: t("ratio"), value: r.ratio === null ? "-" : f.percent(r.ratio * 100, 1) },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("result")} {r.anexo ? <Badge variant={r.anexo === "III" ? "success" : "warning"}>{t("anexo", { anexo: r.anexo })}</Badge> : null}
          </CardTitle>
          <CardDescription>{r.anexo === null ? t("noRevenue") : r.anexo === "III" ? t("isIII") : t("isV", { missing: f.money(r.payrollFor28) })}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("how")}</CardContent>
      </Card>
    </div>
  );
}
