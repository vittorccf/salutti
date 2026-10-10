import Link from "next/link";
import { ClipboardList, Plus, TableProperties } from "lucide-react";
import { db } from "@/lib/db";
import { PLAN_STATUSES, planTotals } from "@/lib/odonto";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { canEditPlans, canPlans, patientScope, requireOdonto } from "@/app/app/odonto/_lib";
import { PLAN_BADGE } from "@/app/app/odonto/_components/badges";
import { createPlanAction } from "./_actions";

export const dynamic = "force-dynamic";

const VIEWS = ["abertos", ...PLAN_STATUSES, "todos"] as const;

export default async function PlansPage({ searchParams }: { searchParams: { ver?: string } }) {
  const ctx = await requireOdonto("odontograma", canPlans);
  const view = (VIEWS as readonly string[]).includes(searchParams.ver ?? "") ? searchParams.ver! : "abertos";
  const statusFilter = view === "todos" ? undefined : view === "abertos" ? { in: ["em_estudo", "aprovado"] } : view;
  const [t, f, plans, patients, summary] = await Promise.all([
    getTranslations("odonto.plans"),
    getFormat(),
    db.treatmentPlan.findMany({
      where: { workspaceId: ctx.workspace.id, ...(statusFilter ? { status: statusFilter } : {}), patient: { deletedAt: null, ...patientScope(ctx) } },
      include: { patient: { select: { fullName: true } }, professional: { select: { fullName: true } }, items: { select: { price: true, status: true } } },
      orderBy: { number: "desc" },
      take: 200,
    }),
    canEditPlans(ctx)
      ? db.patient.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true, ...patientScope(ctx) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 })
      : Promise.resolve([]),
    db.treatmentPlan.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id, patient: { deletedAt: null, ...patientScope(ctx) } }, _count: true }),
  ]);
  const count = (s: string) => summary.find((x) => x.status === s)?._count ?? 0;
  const decided = count("aprovado") + count("concluido") + count("recusado");
  const acceptance = decided ? Math.round(((count("aprovado") + count("concluido")) / decided) * 100) : null;
  const openValue = plans.filter((p) => p.status === "em_estudo").reduce((s, p) => s + planTotals(p.items, p.discount).net, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/app/planos/tabela">
            <TableProperties className="h-4 w-4" aria-hidden /> {t("tableLink")}
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("metrics.study"), value: String(count("em_estudo")) },
          { label: t("metrics.openValue"), value: f.money(openValue) },
          { label: t("metrics.acceptance"), value: acceptance === null ? "-" : f.percent(acceptance, 0) },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {canEditPlans(ctx) ? (
        <ActionForm action={createPlanAction} className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label htmlFor="patientId">{t("newFor")}</Label>
            <Select id="patientId" name="patientId" required defaultValue="">
              <option value="" disabled>
                {t("pickPatient")}
              </option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">
            <Plus className="h-4 w-4" aria-hidden /> {t("new")}
          </Button>
        </ActionForm>
      ) : null}

      <nav aria-label={t("viewsLabel")} className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/app/planos?ver=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${view === v ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      {plans.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("columns.number")}</TH>
                  <TH>{t("columns.patient")}</TH>
                  <TH>{t("columns.professional")}</TH>
                  <TH>{t("columns.progress")}</TH>
                  <TH className="text-right">{t("columns.total")}</TH>
                  <TH>{t("columns.status")}</TH>
                </TR>
              </THead>
              <TBody>
                {plans.map((p) => {
                  const tot = planTotals(p.items, p.discount);
                  return (
                    <TR key={p.id}>
                      <TD className="font-tooth whitespace-nowrap">
                        <Link href={`/app/planos/${p.id}`} className="text-brand underline-offset-4 hover:underline">
                          {t("number", { number: p.number })}
                        </Link>
                      </TD>
                      <TD>
                        {p.patient.fullName}
                        {p.title ? <span className="block text-xs text-muted-foreground">{p.title}</span> : null}
                      </TD>
                      <TD>{p.professional?.fullName ?? "-"}</TD>
                      <TD className="whitespace-nowrap">{t("progress", { done: tot.doneCount, total: tot.count })}</TD>
                      <TD className="text-right tabular-nums">{f.money(tot.net)}</TD>
                      <TD>
                        <Badge variant={PLAN_BADGE[p.status] ?? "muted"}>{t(`status.${p.status}`)}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
