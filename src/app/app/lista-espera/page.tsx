import Link from "next/link";
import { AlertTriangle, Hourglass, MessageCircle, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/app-url";
import { canSeeClinical } from "@/lib/permissions";
import { describePhone, whatsappLink } from "@/lib/phone";
import { CLOSED_STATUSES, matchesSlot, MODALITIES, OPEN_STATUSES, REASON_MAX, REFERRAL_AFTER_DAYS, SHIFTS, SOURCES, WAITLIST_STATUSES, waitlistMetrics, WEEKDAYS } from "@/lib/waitlist";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmSubmit } from "@/components/forms/confirm-submit";
import { CopyButton } from "@/components/copy-button";
import { EmailInput } from "@/components/forms/email-input";
import { PhoneInput } from "@/components/forms/phone-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { contactAction, convertAction, deleteEntryAction, saveEntryAction, saveSettingsAction, setStatusAction } from "./_actions";
import { anonymizeExpired, requireWaitlist } from "./_lib";

export const dynamic = "force-dynamic";

const VIEWS = ["abertos", "agendados", "encerrados", "todos"] as const;
type View = (typeof VIEWS)[number];

type Entry = Awaited<ReturnType<typeof db.waitlistEntry.findMany>>[number];
type Pro = { id: string; fullName: string };

async function EntryFields({ entry, professionals, clinical }: { entry?: Entry; professionals: Pro[]; clinical: boolean }) {
  const t = await getTranslations("waitlist");
  const k = entry?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`name-${k}`}>{t("form.name")}</Label>
        <Input id={`name-${k}`} name="fullName" required minLength={2} maxLength={120} defaultValue={entry?.fullName ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`phone-${k}`}>{t("form.phone")}</Label>
        <PhoneInput id={`phone-${k}`} name="phone" defaultValue={entry?.phone ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`email-${k}`}>{t("form.email")}</Label>
        <EmailInput id={`email-${k}`} name="email" defaultValue={entry?.email ?? ""} />
      </div>
      <div className="group space-y-2 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isMinor" defaultChecked={entry?.isMinor} className="h-4 w-4 accent-primary" />
          {t("form.isMinor")}
        </label>
        <div className="hidden space-y-1.5 group-has-[input[name=isMinor]:checked]:block">
          <Label htmlFor={`guardian-${k}`}>{t("form.guardian")}</Label>
          <Input id={`guardian-${k}`} name="guardianName" maxLength={120} defaultValue={entry?.guardianName ?? ""} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`modality-${k}`}>{t("form.modality")}</Label>
        <Select id={`modality-${k}`} name="modality" defaultValue={entry?.modality ?? "indiferente"}>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {t(`modality.${m}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pro-${k}`}>{t("form.professional")}</Label>
        <Select id={`pro-${k}`} name="professionalId" defaultValue={entry?.professionalId ?? ""}>
          <option value="">{t("form.anyProfessional")}</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t("form.days")}</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="days" value={d} defaultChecked={entry?.preferredDays.includes(d)} className="h-4 w-4 accent-primary" />
              {t(`days.${d}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t("form.shifts")}</legend>
        <div className="flex flex-wrap gap-2">
          {SHIFTS.map((s) => (
            <label key={s} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="shifts" value={s} defaultChecked={entry?.preferredShifts.includes(s)} className="h-4 w-4 accent-primary" />
              {t(`shifts.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor={`price-${k}`}>{t("form.price")}</Label>
        <Input id={`price-${k}`} name="priceNote" maxLength={120} defaultValue={entry?.priceNote ?? ""} placeholder={t("form.pricePlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`source-${k}`}>{t("form.source")}</Label>
        <Select id={`source-${k}`} name="source" defaultValue={entry?.source ?? "outro"}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`sources.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      {clinical ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`reason-${k}`}>{t("form.reason")}</Label>
          <Input id={`reason-${k}`} name="reason" maxLength={REASON_MAX} defaultValue={entry?.reason ?? ""} aria-describedby={`reason-hint-${k}`} />
          <p id={`reason-hint-${k}`} className="text-xs text-muted-foreground">
            {t("form.reasonHint")}
          </p>
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="priority" value="1" defaultChecked={entry?.priority === 1} className="h-4 w-4 accent-primary" />
        {t("form.priority")}
      </label>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`notes-${k}`}>{t("form.notes")}</Label>
        <Textarea id={`notes-${k}`} name="notes" rows={2} maxLength={1000} defaultValue={entry?.notes ?? ""} />
      </div>
    </div>
  );
}

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ ver?: string; dia?: string; turno?: string; modalidade?: string }> }) {
  const ctx = await requireWaitlist();
  const wsId = ctx.workspace.id;
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.ver ?? "") ? (sp.ver as View) : "abertos";
  // A sessão de suporte é somente leitura; a anonimização fica para o cron e para o próximo acesso da equipe.
  if (!ctx.support) await anonymizeExpired(wsId);
  const [t, f] = await Promise.all([getTranslations("waitlist"), getFormat()]);
  const clinical = canSeeClinical(ctx);
  const statusesFor: Record<View, string[]> = { abertos: OPEN_STATUSES, agendados: ["agendado"], encerrados: CLOSED_STATUSES, todos: [...WAITLIST_STATUSES] };

  const [summary, listed, professionals] = await Promise.all([
    db.waitlistEntry.findMany({ where: { workspaceId: wsId }, select: { status: true, urgent: true, createdAt: true, statusChangedAt: true } }),
    db.waitlistEntry.findMany({
      where: { workspaceId: wsId, status: { in: statusesFor[view] } },
      orderBy: [{ priority: "desc" }, { urgent: "desc" }, { createdAt: "asc" }],
      take: 500,
    }),
    db.professional.findMany({ where: { workspaceId: wsId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const metrics = waitlistMetrics(summary);
  let rows = listed;
  // "Abriu uma vaga": quem combina com dia, turno e modalidade.
  const slot = sp.dia && sp.turno ? { day: sp.dia, shift: sp.turno, modality: sp.modalidade || "indiferente" } : null;
  if (slot) rows = rows.filter((e) => matchesSlot(e, slot));
  const urgentOpen = summary.filter((e) => e.urgent && OPEN_STATUSES.includes(e.status as (typeof OPEN_STATUSES)[number])).length;
  const proName = (id: string | null) => professionals.find((p) => p.id === id)?.fullName;
  const daysWaiting = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  const publicLink = ctx.workspace.waitlistPublic && ctx.workspace.waitlistSlug ? `${appOrigin()}/espera/${ctx.workspace.waitlistSlug}` : null;
  const canSettings = ctx.permissions.has("equipe.gerenciar");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Hourglass className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("metrics.waiting"), value: String(metrics.waiting) },
          { label: t("metrics.avgWait"), value: metrics.avgDays === null ? "-" : t("metrics.days", { count: metrics.avgDays }) },
          { label: t("metrics.medianWait"), value: metrics.medianDays === null ? "-" : t("metrics.days", { count: metrics.medianDays }) },
          { label: t("metrics.conversion"), value: metrics.conversion === null ? "-" : f.percent(metrics.conversion, 0) },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {urgentOpen ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-strong">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("urgentBanner", { count: urgentOpen })}
        </p>
      ) : null}

      <nav aria-label={t("viewsLabel")} className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/app/lista-espera?ver=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${view === v ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border p-3" aria-label={t("slot.label")}>
        <input type="hidden" name="ver" value={view} />
        <p className="w-full text-sm font-medium">{t("slot.title")}</p>
        <div className="space-y-1">
          <Label htmlFor="dia" className="text-xs">{t("form.day")}</Label>
          <Select id="dia" name="dia" defaultValue={sp.dia ?? ""} className="h-9 w-32">
            <option value="">-</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>{t(`days.${d}`)}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="turno" className="text-xs">{t("form.shift")}</Label>
          <Select id="turno" name="turno" defaultValue={sp.turno ?? ""} className="h-9 w-32">
            <option value="">-</option>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>{t(`shifts.${s}`)}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="modalidade" className="text-xs">{t("form.modality")}</Label>
          <Select id="modalidade" name="modalidade" defaultValue={sp.modalidade ?? ""} className="h-9 w-36">
            <option value="">-</option>
            {MODALITIES.filter((m) => m !== "indiferente").map((m) => (
              <option key={m} value={m}>{t(`modality.${m}`)}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm">{t("slot.find")}</Button>
        {slot ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/app/lista-espera?ver=${view}`}>{t("slot.clear")}</Link>
          </Button>
        ) : null}
      </form>

      <details className="rounded-xl border bg-card p-4">
        <summary className="flex cursor-pointer items-center gap-2 font-medium text-brand">
          <UserPlus className="h-4 w-4" aria-hidden /> {t("add")}
        </summary>
        <ActionForm action={saveEntryAction} resetOnSuccess className="mt-4 space-y-3">
          <EntryFields professionals={professionals} clinical={clinical} />
          <Button type="submit">{t("addSubmit")}</Button>
        </ActionForm>
      </details>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{slot ? t("emptySlot") : t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => {
            const phone = describePhone(e.phone);
            // Mensagem discreta: o celular pode ser compartilhado, então fala o nome de quem atende, não "psicoterapia".
            const sender = proName(e.professionalId) ?? ctx.user.name;
            const greetName = (e.isMinor && e.guardianName ? e.guardianName : e.fullName).split(" ")[0];
            const message = t(e.isMinor ? "whatsappTextGuardian" : "whatsappText", { name: greetName, patient: e.fullName.split(" ")[0], sender });
            const waited = daysWaiting(e.createdAt);
            const open = OPEN_STATUSES.includes(e.status as (typeof OPEN_STATUSES)[number]);
            const suggestReferral = open && !e.anonymizedAt && waited >= REFERRAL_AFTER_DAYS;
            return (
              <li key={e.id}>
                <Card className={e.urgent && OPEN_STATUSES.includes(e.status as (typeof OPEN_STATUSES)[number]) ? "border-destructive/50" : ""}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {e.anonymizedAt ? t("anonymized") : e.fullName}
                          {e.isMinor && !e.anonymizedAt ? <span className="text-xs text-muted-foreground"> · {t("minor", { guardian: e.guardianName ?? "-" })}</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {phone?.display ?? "-"}
                          {e.email ? ` · ${e.email}` : ""} · {t("waitingFor", { count: waited })} · {t(`sources.${e.source}`)}
                          {e.contactAttempts ? ` · ${t("attempts", { count: e.contactAttempts })}` : ""}
                          {e.lastContactAt ? ` · ${t("lastContact", { date: f.date(e.lastContactAt) })}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={OPEN_STATUSES.includes(e.status as (typeof OPEN_STATUSES)[number]) ? "warning" : e.status === "agendado" ? "success" : "muted"}>{t(`status.${e.status}`)}</Badge>
                        {e.urgent ? <Badge variant="destructive">{t("urgent")}</Badge> : null}
                        {e.priority ? <Badge variant="highlight">{t("highPriority")}</Badge> : null}
                        {e.createdVia === "formulario" ? <Badge variant="outline">{t("viaForm")}</Badge> : null}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(`modality.${e.modality}`)}
                      {e.preferredDays.length ? ` · ${e.preferredDays.map((d) => t(`days.${d}`)).join(", ")}` : ""}
                      {e.preferredShifts.length ? ` · ${e.preferredShifts.map((s) => t(`shifts.${s}`)).join(", ")}` : ""}
                      {proName(e.professionalId) ? ` · ${proName(e.professionalId)}` : ""}
                      {e.priceNote ? ` · ${e.priceNote}` : ""}
                    </p>
                    {e.reason && clinical ? <p className="rounded-md bg-muted p-2 text-sm">{t("reason", { reason: e.reason })}</p> : null}
                    {e.notes ? <p className="text-sm">{t("notesValue", { notes: e.notes })}</p> : null}
                    {suggestReferral ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
                        <span>{t("referralHint", { count: waited })}</span>
                        {e.phone ? (
                          <a
                            href={whatsappLink(e.phone, t("referralText", { name: greetName, sender }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand underline-offset-4 hover:underline"
                          >
                            {t("referralSend")}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    {e.anonymizedAt ? null : (
                      <div className="flex flex-wrap items-center gap-2">
                        {e.phone ? (
                          <Button size="sm" variant="outline" asChild>
                            <a href={whatsappLink(e.phone, message)} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-4 w-4" aria-hidden /> {t("whatsapp")}
                            </a>
                          </Button>
                        ) : null}
                        <ActionForm action={contactAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <Button type="submit" size="sm" variant="ghost">{t("registerContact")}</Button>
                        </ActionForm>
                        {e.status !== "agendado" ? (
                          <ActionForm action={convertAction}>
                            <input type="hidden" name="id" value={e.id} />
                            <Button type="submit" size="sm">{t("convert")}</Button>
                          </ActionForm>
                        ) : e.convertedPatientId ? (
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/app/pacientes/${e.convertedPatientId}`}>{t("openPatient")}</Link>
                          </Button>
                        ) : null}
                        <ActionForm action={setStatusAction} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={e.id} />
                          <Select name="status" defaultValue={e.status} aria-label={t("statusOf", { name: e.fullName })} className="h-8 w-auto text-xs">
                            {WAITLIST_STATUSES.map((s) => (
                              <option key={s} value={s}>{t(`status.${s}`)}</option>
                            ))}
                          </Select>
                          <Button type="submit" size="sm" variant="ghost">{t("saveStatus")}</Button>
                        </ActionForm>
                      </div>
                    )}
                    {e.anonymizedAt ? null : (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{t("edit")}</summary>
                        <ActionForm action={saveEntryAction} className="mt-3 space-y-3">
                          <EntryFields entry={e} professionals={professionals} clinical={clinical} />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Button type="submit" variant="outline" size="sm">{t("saveEdit")}</Button>
                          </div>
                        </ActionForm>
                        <ActionForm action={deleteEntryAction} className="mt-2">
                          <input type="hidden" name="id" value={e.id} />
                          <ConfirmSubmit variant="ghost" size="sm" className="text-destructive-strong" confirmText={t("deleteConfirm", { name: e.fullName })}>
                            {t("delete")}
                          </ConfirmSubmit>
                        </ActionForm>
                      </details>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {canSettings ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.title")}</CardTitle>
            <CardDescription>{t("settings.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {publicLink ? (
              <div className="space-y-2 rounded-lg border border-brand/30 bg-accent/40 p-3">
                <p className="text-sm font-medium">{t("settings.linkReady")}</p>
                <p className="break-all font-mono text-xs">{publicLink}</p>
                <CopyButton text={publicLink} label={t("settings.copy")} copiedLabel={t("settings.copied")} />
              </div>
            ) : null}
            <ActionForm action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="public" defaultChecked={ctx.workspace.waitlistPublic} className="h-4 w-4 accent-primary" />
                {t("settings.public")}
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="slug">{t("settings.slug")}</Label>
                <Input id="slug" name="slug" maxLength={40} defaultValue={ctx.workspace.waitlistSlug ?? ""} placeholder="dra-ana-silva" pattern="[a-z0-9\-]{3,40}" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate">{t("settings.estimate")}</Label>
                <Input id="estimate" name="estimate" maxLength={120} defaultValue={ctx.workspace.waitlistEstimate ?? ""} placeholder={t("settings.estimatePlaceholder")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="intro">{t("settings.intro")}</Label>
                <Textarea id="intro" name="intro" rows={2} maxLength={500} defaultValue={ctx.workspace.waitlistIntro ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline">{t("settings.save")}</Button>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
