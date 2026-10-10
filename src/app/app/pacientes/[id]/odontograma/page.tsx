import Link from "next/link";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { isToothStatus, isValidTooth, TOOTH_STATUSES, type ToothStatus } from "@/lib/odonto";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { canClinical, canClinicalWrite, canEditPlans, findPatient, requireOdonto } from "@/app/app/odonto/_lib";
import { FacesField, ToothChart } from "@/app/app/odonto/_components/tooth-chart";
import { createPlanAction } from "@/app/app/planos/_actions";
import { PLAN_BADGE } from "@/app/app/odonto/_components/badges";
import { saveToothAction } from "./_actions";

export const dynamic = "force-dynamic";

export default async function OdontogramPage({ params, searchParams }: { params: { id: string }; searchParams: { dente?: string; denticao?: string } }) {
  const ctx = await requireOdonto("odontograma", canClinical);
  const patient = await findPatient(ctx, params.id);
  const dentition = searchParams.denticao === "decidua" ? "decidua" : "permanente";
  const selected = searchParams.dente && isValidTooth(Number(searchParams.dente)) ? Number(searchParams.dente) : null;
  const [t, tp, f, records, plans, professionals, history] = await Promise.all([
    getTranslations("odonto.chart"),
    getTranslations("odonto.plans"),
    getFormat(),
    db.toothRecord.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id } }),
    db.treatmentPlan.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, include: { items: { select: { price: true, status: true } } } }),
    db.professional.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    selected
      ? db.treatmentItem.findMany({
          where: { tooth: selected, workspaceId: ctx.workspace.id, plan: { patientId: patient.id } },
          orderBy: { createdAt: "desc" },
          include: { plan: { select: { id: true, number: true } } },
        })
      : Promise.resolve([]),
  ]);
  const teeth = Object.fromEntries(records.filter((r) => isToothStatus(r.status)).map((r) => [r.tooth, r.status as ToothStatus])) as Record<number, ToothStatus>;
  const current = selected ? records.find((r) => r.tooth === selected) : null;
  const base = `/app/pacientes/${patient.id}/odontograma`;
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const counts = TOOTH_STATUSES.filter((s) => s !== "higido").map((s) => ({ s, n: records.filter((r) => r.status === s).length })).filter((x) => x.n);

  return (
    <div className="space-y-6">
      <Link href={`/app/pacientes/${patient.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {patient.fullName}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <nav aria-label={t("dentitionLabel")} className="flex gap-2">
          {(["permanente", "decidua"] as const).map((d) => (
            <Link
              key={d}
              href={qs({ denticao: d === "decidua" ? d : undefined })}
              aria-current={dentition === d ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm ${dentition === d ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(`dentition.${d}`)}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardContent className="space-y-4 p-6">
            <ToothChart teeth={teeth} dentition={dentition} selected={selected} hrefFor={(n) => qs({ denticao: dentition === "decidua" ? dentition : undefined, dente: n })} />
            {counts.length ? (
              <p className="text-center text-sm text-muted-foreground">{counts.map((c) => t("count", { count: c.n, status: t(`status.${c.s}`) })).join(" · ")}</p>
            ) : (
              <p className="text-center text-sm text-muted-foreground">{t("allHealthy")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? t("toothTitle", { tooth: selected }) : t("pickTitle")}</CardTitle>
            <CardDescription>{selected ? t("toothDescription") : t("pickDescription")}</CardDescription>
          </CardHeader>
          {selected ? (
            <CardContent className="space-y-5">
              {canClinicalWrite(ctx) ? (
              <ActionForm key={selected} action={saveToothAction} className="space-y-3">
                <input type="hidden" name="patientId" value={patient.id} />
                <input type="hidden" name="tooth" value={selected} />
                <div className="space-y-1.5">
                  <Label htmlFor="status">{t("statusLabel")}</Label>
                  <Select id="status" name="status" defaultValue={current?.status ?? "higido"}>
                    {TOOTH_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <FacesField idPrefix={`face-${selected}`} selected={current?.faces} />
                <p className="text-xs text-muted-foreground">{t("facesHint")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="note">{t("note")}</Label>
                  <Input id="note" name="note" maxLength={500} defaultValue={current?.note ?? ""} placeholder={t("notePlaceholder")} />
                </div>
                <Button type="submit">{t("save")}</Button>
              </ActionForm>
              ) : null}
              <div>
                <p className="text-overline mb-2 text-muted-foreground">{t("history")}</p>
                {history.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {history.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {h.name} {h.faces ? <span className="font-tooth text-xs">· {h.faces}</span> : null}
                        </span>
                        <Link href={`/app/planos/${h.plan.id}`} className="text-xs text-brand underline-offset-4 hover:underline">
                          {tp(`itemStatus.${h.status}`)} · {tp("number", { number: h.plan.number })}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
                )}
              </div>
            </CardContent>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-brand" aria-hidden /> {tp("patientPlans")}
            </CardTitle>
            <CardDescription>{tp("patientPlansDescription")}</CardDescription>
          </div>
          {canEditPlans(ctx) ? (
            <ActionForm action={createPlanAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="patientId" value={patient.id} />
              <Select name="professionalId" aria-label={tp("professional")} defaultValue="" className="h-9 w-auto">
                <option value="">{tp("anyProfessional")}</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" aria-hidden /> {tp("new")}
              </Button>
            </ActionForm>
          ) : null}
        </CardHeader>
        <CardContent>
          {plans.length ? (
            <ul className="divide-y rounded-lg border">
              {plans.map((p) => {
                const total = p.items.filter((i) => i.status !== "cancelado").reduce((s, i) => s + i.price, 0) - p.discount;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <Link href={`/app/planos/${p.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                      {tp("number", { number: p.number })}
                      {p.title ? ` · ${p.title}` : ""}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{f.money(Math.max(0, total))}</span>
                      <Badge variant={PLAN_BADGE[p.status] ?? "muted"}>{tp(`status.${p.status}`)}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{tp("noPatientPlans")}</p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("legalNote")}</p>
    </div>
  );
}
