import Link from "next/link";
import { CalendarClock, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP, startOfTodaySP } from "@/lib/dates";
import { addDaysKey, addMonthsKey } from "@/lib/payables";
import { RECALL_REASONS } from "@/lib/odonto";
import { can } from "@/lib/permissions";
import { whatsappLink } from "@/lib/phone";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { canManageLab, patientScope, requireOdonto } from "@/app/app/odonto/_lib";
import { createRecallAction, setRecallAction } from "./_actions";

export const dynamic = "force-dynamic";

const VIEWS = ["vencidos", "proximos", "agendados", "todos"] as const;

export default async function RecallsPage({ searchParams }: { searchParams: { ver?: string; atualizado?: string } }) {
  const ctx = await requireOdonto("odontograma", (c) => can(c, "pacientes.gerenciar"));
  const view = (VIEWS as readonly string[]).includes(searchParams.ver ?? "") ? searchParams.ver! : "vencidos";
  const today = dateKeySP();
  const todayStart = startOfTodaySP();
  const in30 = new Date(todayStart.getTime() + 31 * 86_400_000);
  const where =
    view === "vencidos"
      ? { status: "pendente", dueDate: { lt: todayStart } }
      : view === "proximos"
        ? { status: "pendente", dueDate: { gte: todayStart, lt: in30 } }
        : view === "agendados"
          ? { status: "agendado" }
          : {};
  const [t, f, recalls, patients, overdue] = await Promise.all([
    getTranslations("odonto.recall"),
    getFormat(),
    db.recall.findMany({
      where: { workspaceId: ctx.workspace.id, ...where, patient: { deletedAt: null, ...patientScope(ctx) } },
      include: { patient: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { dueDate: "asc" },
      take: 300,
    }),
    db.patient.findMany({ where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true, ...patientScope(ctx) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
    db.recall.count({ where: { workspaceId: ctx.workspace.id, status: "pendente", dueDate: { lt: todayStart }, patient: { deletedAt: null, ...patientScope(ctx) } } }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      {searchParams.atualizado ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("statusSaved")}
        </p>
      ) : null}

      {canManageLab(ctx) ? (
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-medium text-brand">{t("add")}</summary>
        <ActionForm action={createRecallAction} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 lg:col-span-2">
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
            <Label htmlFor="reason">{t("reason")}</Label>
            <Select id="reason" name="reason" defaultValue="profilaxia">
              {RECALL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">{t("dueDate")}</Label>
            <Input id="dueDate" name="dueDate" type="date" required defaultValue={addMonthsKey(today, 6)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="note">{t("note")}</Label>
            <Input id="note" name="note" maxLength={300} />
          </div>
          <div className="self-end">
            <Button type="submit">{t("addSubmit")}</Button>
          </div>
        </ActionForm>
      </details>
      ) : null}

      <nav aria-label={t("viewsLabel")} className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/app/retornos?ver=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${view === v ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`views.${v}`)}
            {v === "vencidos" && overdue ? ` (${overdue})` : ""}
          </Link>
        ))}
      </nav>

      {recalls.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {recalls.map((r) => {
            const late = r.status === "pendente" && dateKeySP(r.dueDate) < today;
            const first = r.patient.fullName.split(" ")[0];
            return (
              <li key={r.id}>
                <Card className={late ? "border-warning/60" : ""}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <Link href={`/app/pacientes/${r.patient.id}`} className="underline-offset-4 hover:underline">
                          {r.patient.fullName}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(`reasons.${r.reason}`)} · {late ? t("lateSince", { date: f.date(r.dueDate) }) : t("dueOn", { date: f.date(r.dueDate) })}
                        {r.contactedAt ? ` · ${t("contactedOn", { date: f.date(r.contactedAt) })}` : ""}
                      </p>
                      {r.note ? <p className="text-sm">{r.note}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={late ? "warning" : r.status === "feito" ? "success" : r.status === "agendado" ? "default" : "muted"}>{late ? t("late") : t(`status.${r.status}`)}</Badge>
                      {r.patient.phone && r.status === "pendente" ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={whatsappLink(r.patient.phone, t("whatsappText", { name: first, workspace: ctx.workspace.name }))} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="h-4 w-4" aria-hidden /> {t("whatsapp")}
                          </a>
                        </Button>
                      ) : null}
                      {(r.status === "pendente" || r.status === "agendado") && canManageLab(ctx) ? (
                        <ActionForm action={setRecallAction} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={r.id} />
                          <Select name="status" defaultValue={r.status === "pendente" ? "contato" : "feito"} aria-label={t("actionFor", { name: r.patient.fullName })} className="h-8 w-auto text-xs">
                            {r.status === "pendente" ? <option value="contato">{t("actions.contato")}</option> : null}
                            {r.status === "pendente" ? <option value="agendado">{t("actions.agendado")}</option> : null}
                            <option value="feito">{t("actions.feito")}</option>
                            <option value="cancelado">{t("actions.cancelado")}</option>
                          </Select>
                          <Button type="submit" size="sm" variant="ghost">
                            {t("apply")}
                          </Button>
                        </ActionForm>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("footnote", { date: f.date(`${addDaysKey(today, 30)}T12:00:00Z`) })}</p>
    </div>
  );
}
