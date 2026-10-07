import Link from "next/link";
import { Plus, Syringe } from "lucide-react";
import { db } from "@/lib/db";
import { canSeeClinical } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getFormat, getTranslations } from "@/i18n/server";
import { isProcedureCategory } from "@/lib/procedures";
import { PRESETS, requireProceduresContext } from "./_lib";

export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const ctx = await requireProceduresContext();
  const canEdit = canSeeClinical(ctx.role);
  const [t, tc, f] = await Promise.all([getTranslations("aesthetics.list"), getTranslations("aesthetics.categories"), getFormat()]);
  const procedures = await db.procedure.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { supplies: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Syringe className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canEdit && procedures.length > 0 ? (
          <Button asChild>
            <Link href="/app/procedimentos/novo">
              <Plus className="h-4 w-4" aria-hidden /> {t("new")}
            </Link>
          </Button>
        ) : null}
      </header>

      {procedures.length === 0 ? (
        <EmptyState
          icon={<Syringe className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            canEdit ? (
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-2">
                  {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => (
                    <Button key={key} variant="outline" size="sm" asChild>
                      <Link href={`/app/procedimentos/novo?sugestao=${key}`}>{t(`suggestions.${key}`)}</Link>
                    </Button>
                  ))}
                </div>
                <Button asChild>
                  <Link href="/app/procedimentos/novo">
                    <Plus className="h-4 w-4" aria-hidden /> {t("new")}
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("name")}</TH>
                  <TH>{t("category")}</TH>
                  <TH className="text-right">{t("duration")}</TH>
                  <TH className="text-right">{t("price")}</TH>
                  <TH className="text-right">{t("returnDays")}</TH>
                  <TH>{t("supplies")}</TH>
                  <TH>{t("status")}</TH>
                </TR>
              </THead>
              <TBody>
                {procedures.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      {canEdit ? (
                        <Link href={`/app/procedimentos/${p.id}`} className="text-brand underline-offset-4 hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </TD>
                    <TD>{isProcedureCategory(p.category) ? tc(p.category) : p.category}</TD>
                    <TD className="text-right whitespace-nowrap">{t("minutes", { minutes: p.durationMinutes })}</TD>
                    <TD className="text-right">{p.price != null ? f.money(p.price) : "-"}</TD>
                    <TD className="text-right whitespace-nowrap">{p.returnDays ? t("days", { days: p.returnDays }) : "-"}</TD>
                    <TD className="text-muted-foreground">{t("suppliesCount", { count: p._count.supplies })}</TD>
                    <TD>
                      <Badge variant={p.active ? "success" : "muted"}>{p.active ? t("active") : t("inactive")}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
