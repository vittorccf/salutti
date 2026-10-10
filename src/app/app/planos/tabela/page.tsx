import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { SPECIALTIES, TOOTH_RESULTS } from "@/lib/odonto";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { canEditTable, canPlans, requireOdonto } from "@/app/app/odonto/_lib";
import { loadSuggestedAction, saveProcedureAction, toggleProcedureAction } from "./_actions";

export const dynamic = "force-dynamic";

type Proc = Awaited<ReturnType<typeof db.dentalProcedure.findMany>>[number];

async function ProcedureFields({ p }: { p?: Proc }) {
  const t = await getTranslations("odonto.table");
  const k = p?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`name-${k}`}>{t("name")}</Label>
        <Input id={`name-${k}`} name="name" required minLength={2} maxLength={160} defaultValue={p?.name ?? ""} placeholder={t("namePlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`spec-${k}`}>{t("specialty")}</Label>
        <Select id={`spec-${k}`} name="specialty" defaultValue={p?.specialty ?? "dentistica"}>
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>
              {t(`specialties.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`price-${k}`}>{t("price")}</Label>
        <Input id={`price-${k}`} name="price" inputMode="decimal" defaultValue={p?.price !== null && p?.price !== undefined ? String(p.price).replace(".", ",") : ""} placeholder="0,00" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`tuss-${k}`}>{t("tuss")}</Label>
        <Input id={`tuss-${k}`} name="tussCode" inputMode="numeric" maxLength={8} className="font-tooth" defaultValue={p?.tussCode ?? ""} placeholder={t("tussPlaceholder")} aria-describedby={`tuss-hint-${k}`} />
        <p id={`tuss-hint-${k}`} className="text-xs text-muted-foreground">
          {t("tussHint")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`result-${k}`}>{t("toothResult")}</Label>
        <Select id={`result-${k}`} name="toothResult" defaultValue={p?.toothResult ?? ""}>
          <option value="">{t("noChange")}</option>
          {TOOTH_RESULTS.map((r) => (
            <option key={r} value={r}>
              {t(`results.${r}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`ret-${k}`}>{t("returnMonths")}</Label>
        <Input id={`ret-${k}`} name="returnMonths" type="number" min={0} max={24} defaultValue={p?.returnMonths ?? ""} placeholder={t("returnPlaceholder")} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="perTooth" defaultChecked={p ? p.perTooth : true} className="h-4 w-4 accent-primary" />
        {t("perTooth")}
      </label>
    </div>
  );
}

export default async function ProcedureTablePage({ searchParams }: { searchParams: { carregados?: string } }) {
  const ctx = await requireOdonto("odontograma", canPlans);
  const [t, f, procs] = await Promise.all([
    getTranslations("odonto.table"),
    getFormat(),
    db.dentalProcedure.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: [{ active: "desc" }, { specialty: "asc" }, { name: "asc" }] }),
  ]);
  const edit = canEditTable(ctx);

  return (
    <div className="space-y-6">
      <Link href="/app/planos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <header>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      {searchParams.carregados && /^\d+$/.test(searchParams.carregados) ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("loaded", { count: Number(searchParams.carregados) })}
        </p>
      ) : null}

      {edit && procs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("suggestedTitle")}</CardTitle>
            <CardDescription>{t("suggestedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={loadSuggestedAction}>
              <Button type="submit">{t("loadSuggested")}</Button>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {edit ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-medium text-brand">{t("add")}</summary>
          <ActionForm action={saveProcedureAction} resetOnSuccess className="mt-4 space-y-3">
            <ProcedureFields />
            <Button type="submit">{t("addSubmit")}</Button>
          </ActionForm>
        </details>
      ) : null}

      {procs.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("name")}</TH>
                  <TH>{t("specialty")}</TH>
                  <TH>{t("tuss")}</TH>
                  <TH className="text-right">{t("price")}</TH>
                  <TH>{t("rules")}</TH>
                  <TH>
                    <span className="sr-only">{t("actions")}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {procs.map((p) => (
                  <TR key={p.id} className={p.active ? "" : "opacity-60"}>
                    <TD className="align-top">
                      {p.name}
                      {edit ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("edit")}</summary>
                          <ActionForm action={saveProcedureAction} className="mt-3 space-y-3">
                            <ProcedureFields p={p} />
                            <Button type="submit" size="sm" variant="outline">
                              {t("saveEdit")}
                            </Button>
                          </ActionForm>
                        </details>
                      ) : null}
                    </TD>
                    <TD className="align-top">{t(`specialties.${p.specialty}`)}</TD>
                    <TD className="font-tooth align-top">{p.tussCode ?? "-"}</TD>
                    <TD className="text-right align-top tabular-nums">{p.price === null ? "-" : f.money(p.price)}</TD>
                    <TD className="align-top">
                      <div className="flex flex-wrap gap-1">
                        {p.perTooth ? <Badge variant="outline">{t("perTooth")}</Badge> : null}
                        {p.toothResult ? <Badge variant="muted">{t(`results.${p.toothResult}`)}</Badge> : null}
                        {p.returnMonths ? <Badge variant="muted">{t("returnBadge", { count: p.returnMonths })}</Badge> : null}
                        {p.active ? null : <Badge variant="muted">{t("inactive")}</Badge>}
                      </div>
                    </TD>
                    <TD className="align-top">
                      {edit ? (
                        <ActionForm action={toggleProcedureAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            {p.active ? t("deactivate") : t("activate")}
                          </Button>
                        </ActionForm>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : !edit ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
    </div>
  );
}
