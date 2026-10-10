import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { addDaysKey } from "@/lib/payables";
import { LAB_NEXT as NEXT, LAB_OPEN, labOverdue } from "@/lib/odonto";
import { can } from "@/lib/permissions";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canManageLab, patientScope, requireOdonto } from "@/app/app/odonto/_lib";
import { LAB_BADGE } from "@/app/app/odonto/_components/badges";
import { createLabOrderAction, setLabStatusAction } from "./_actions";

export const dynamic = "force-dynamic";

const VIEWS = ["abertos", "atrasados", "concluidos", "todos"] as const;

export default async function LabPage({ searchParams }: { searchParams: { ver?: string; atualizado?: string } }) {
  const ctx = await requireOdonto("protese", (c) => can(c, "pacientes.gerenciar"));
  const view = (VIEWS as readonly string[]).includes(searchParams.ver ?? "") ? searchParams.ver! : "abertos";
  const today = dateKeySP();
  const [t, f, orders, patients, professionals, labs] = await Promise.all([
    getTranslations("odonto.lab"),
    getFormat(),
    db.labOrder.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        patient: { deletedAt: null, ...patientScope(ctx) },
        ...(view === "abertos" || view === "atrasados" ? { status: { in: LAB_OPEN } } : view === "concluidos" ? { status: { in: ["recebido", "instalado", "cancelado"] } } : {}),
      },
      include: { patient: { select: { id: true, fullName: true } }, professional: { select: { fullName: true } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    db.patient.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true, ...patientScope(ctx) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
    db.professional.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.labOrder.findMany({ where: { workspaceId: ctx.workspace.id }, distinct: ["lab"], select: { lab: true }, take: 30 }),
  ]);
  const withLate = orders.map((o) => ({ ...o, late: labOverdue({ status: o.status, dueKey: o.dueAt ? dateKeySP(o.dueAt) : null }, today) }));
  const rows = view === "atrasados" ? withLate.filter((o) => o.late) : withLate;
  const lateCount = withLate.filter((o) => o.late).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      {searchParams.atualizado ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("statusSaved")}
        </p>
      ) : null}

      {lateCount ? (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
          {t("lateBanner", { count: lateCount })}
        </p>
      ) : null}

      {canManageLab(ctx) ? (
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium text-brand">{t("add")}</summary>
        <ActionForm action={createLabOrderAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="patientId">{t("patient")}</Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="lab">{t("lab")}</Label>
            <Input id="lab" name="lab" required maxLength={120} list="labs" placeholder={t("labPlaceholder")} />
            <datalist id="labs">
              {labs.map((l) => (
                <option key={l.lab} value={l.lab} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="professionalId">{t("professional")}</Label>
            <Select id="professionalId" name="professionalId" defaultValue="">
              <option value="">-</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work">{t("work")}</Label>
            <Input id="work" name="work" required maxLength={160} placeholder={t("workPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teeth">{t("teeth")}</Label>
            <Input id="teeth" name="teeth" maxLength={80} className="font-tooth" placeholder="11, 21" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shade">{t("shade")}</Label>
            <Input id="shade" name="shade" maxLength={20} placeholder="A2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sentAt">{t("sentAt")}</Label>
            <Input id="sentAt" name="sentAt" type="date" defaultValue={today} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueAt">{t("dueAt")}</Label>
            <Input id="dueAt" name="dueAt" type="date" defaultValue={addDaysKey(today, 10)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cost">{t("cost")}</Label>
            <Input id="cost" name="cost" inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} placeholder={t("notesPlaceholder")} />
          </div>
          <div>
            <Button type="submit">{t("addSubmit")}</Button>
          </div>
        </ActionForm>
      </details>
      ) : null}

      <nav aria-label={t("viewsLabel")} className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/app/protese?ver=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${view === v ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((o) => (
            <li key={o.id}>
              <Card className={o.late ? "border-warning/60" : ""}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {o.work}
                      {o.teeth ? <span className="font-tooth text-sm text-muted-foreground"> · {o.teeth}</span> : null}
                      {o.shade ? <span className="text-sm text-muted-foreground"> · {t("shadeValue", { shade: o.shade })}</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <Link href={`/app/pacientes/${o.patient.id}`} className="text-brand underline-offset-4 hover:underline">
                        {o.patient.fullName}
                      </Link>{" "}
                      · {o.lab}
                      {o.professional ? ` · ${o.professional.fullName}` : ""}
                      {o.cost !== null ? ` · ${f.money(o.cost)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.sentAt ? t("sentOn", { date: f.date(o.sentAt) }) : t("notSent")}
                      {o.dueAt ? ` · ${t("dueOn", { date: f.date(o.dueAt) })}` : ""}
                      {o.receivedAt ? ` · ${t("receivedOn", { date: f.date(o.receivedAt) })}` : ""}
                    </p>
                    {o.notes ? <p className="text-sm">{o.notes}</p> : null}
                    <Link href={`/impressao/protese/${o.id}`} target="_blank" className="text-xs text-brand underline-offset-4 hover:underline">
                      {t("printOrder")}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.late ? <Badge variant="warning">{t("late")}</Badge> : null}
                    <Badge variant={LAB_BADGE[o.status] ?? "muted"}>{t(`status.${o.status}`)}</Badge>
                    {NEXT[o.status]?.length && canManageLab(ctx) ? (
                      <ActionForm action={setLabStatusAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={o.id} />
                        <Select name="status" defaultValue={NEXT[o.status][0]} aria-label={t("nextStep", { work: o.work })} className="h-8 w-auto text-xs">
                          {NEXT[o.status].map((s) => (
                            <option key={s} value={s}>
                              {t(`actions.${s}`)}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" size="sm" variant="outline">
                          {t("apply")}
                        </Button>
                      </ActionForm>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
