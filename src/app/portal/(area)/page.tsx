import Link from "next/link";
import { CalendarPlus, CheckCircle2, ExternalLink, FileText, ListTodo, MapPin, MessagesSquare, StickyNote, Video } from "lucide-react";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-auth";
import { canJoin, JOIN_WINDOW_MINUTES, safeUrl } from "@/lib/portal";
import { addDaysKey } from "@/lib/payables";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { meetingPlatform } from "@/lib/providers/video";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckinForm } from "../_components/checkin-form";
import { respondSessionAction, toggleTaskAction } from "../_actions";

export default async function PortalWeekPage() {
  const access = (await getPortalSession())!;
  const { patient } = access;
  const now = new Date();
  const today = dateKeySP();
  const [t, f, label] = await Promise.all([getTranslations("portal.week"), getFormat(), getTranslations("common.labels").then(labeler)]);

  const [sessions, highlights, cards, charges, unread] = await Promise.all([
    db.appointment.findMany({
      where: { patientId: patient.id, workspaceId: patient.workspaceId, endsAt: { gte: now }, status: { not: "cancelled" } },
      include: { professional: { select: { fullName: true } } },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    db.portalHighlight.findMany({
      where: { patientId: patient.id, workspaceId: patient.workspaceId, archivedAt: null },
      orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 20,
    }),
    db.dailyCard.findMany({ where: { patientId: patient.id, date: { gte: parseDateOnly(addDaysKey(today, -6)) } }, orderBy: { date: "asc" } }),
    db.charge.findMany({
      where: { patientId: patient.id, workspaceId: patient.workspaceId, status: { in: ["pending", "overdue"] } },
      include: { paymentLink: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    db.portalMessage.count({ where: { patientId: patient.id, fromPatient: false, readAt: null } }),
  ]);
  const next = sessions[0];
  const nextUrl = safeUrl(next?.meetingUrl);
  const rest = sessions.slice(1);
  const todayCard = cards.find((c) => dateKeySP(c.date) === today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i - 6);
    return { key, card: cards.find((c) => dateKeySP(c.date) === key) };
  });
  const platform = (url: string) => {
    const name = meetingPlatform(url);
    return !name || name === "Videochamada" ? t("videoCall") : name;
  };
  const daysUntil = next ? Math.round((parseDateOnly(dateKeySP(next.startsAt)).getTime() - parseDateOnly(today).getTime()) / 86_400_000) : 0;
  // Hoje, amanhã, "em 3 dias" até uma semana; depois, a data.
  const when = (d: number) => (d === 0 ? t("today") : d === 1 ? t("tomorrow") : d <= 6 ? t("inDays", { days: d }) : t("onDate", { date: f.date(next!.startsAt) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display">{t("hello", { name: patient.fullName.split(" ")[0] })}</h1>
        <p className="text-muted-foreground">{next ? t("summaryNext", { when: when(daysUntil), time: f.time(next.startsAt) }) : t("summaryNone")}</p>
      </div>

      {unread > 0 ? (
        <Link href="/portal/mensagens" className="flex items-center gap-3 rounded-xl border border-brand/30 bg-accent/60 p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MessagesSquare className="h-5 w-5 text-brand" aria-hidden />
          {t("unreadMessages", { count: unread })}
        </Link>
      ) : null}

      {/* Próxima sessão */}
      {next ? (
        <section aria-labelledby="next-session" className="overflow-hidden rounded-2xl border bg-card">
          <div className="space-y-3 bg-accent/60 p-5">
            <p id="next-session" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("nextSession")} · {when(daysUntil)}
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {f.weekdayDay(next.startsAt)} · {f.time(next.startsAt)}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {next.modality === "online" ? <Video className="h-4 w-4" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
              {next.professional.fullName} · {label("modality", next.modality)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {next.modality === "online" && nextUrl ? (
                canJoin(next.startsAt, next.endsAt, now) ? (
                  <Button asChild size="lg">
                    <a href={nextUrl} target="_blank" rel="noopener noreferrer">
                      <Video className="h-4 w-4" aria-hidden /> {t("join", { platform: platform(nextUrl) })}
                    </a>
                  </Button>
                ) : (
                  <p className="w-full rounded-md bg-background/70 px-3 py-2 text-sm text-muted-foreground">{t("joinLater", { minutes: JOIN_WINDOW_MINUTES })}</p>
                )
              ) : null}
              <Button variant="outline" asChild>
                <a href={`/portal/sessao/${next.id}/agenda`} download>
                  <CalendarPlus className="h-4 w-4" aria-hidden /> {t("addToCalendar")}
                </a>
              </Button>
            </div>
          </div>
          <div className="border-t p-5">
            {next.patientResponse === "confirmed" ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success-strong">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("confirmed")}
              </p>
            ) : next.patientResponse === "reschedule" ? (
              <p className="text-sm text-warning-strong">{t("rescheduleSent")}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t("willYouCome")}</p>
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={respondSessionAction}>
                    <input type="hidden" name="appointmentId" value={next.id} />
                    <input type="hidden" name="response" value="confirmed" />
                    <Button type="submit">{t("confirm")}</Button>
                  </ActionForm>
                  <details className="group w-full sm:w-auto">
                    <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">
                      {t("needReschedule")}
                    </summary>
                    <ActionForm action={respondSessionAction} className="mt-3 space-y-2">
                      <input type="hidden" name="appointmentId" value={next.id} />
                      <input type="hidden" name="response" value="reschedule" />
                      <Label htmlFor="reschedule-note">{t("rescheduleNote")}</Label>
                      <Textarea id="reschedule-note" name="note" rows={2} maxLength={500} placeholder={t("rescheduleNotePlaceholder")} />
                      <Button type="submit" variant="outline">
                        {t("sendReschedule")}
                      </Button>
                    </ActionForm>
                  </details>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">{t("noSessions")}</CardContent>
        </Card>
      )}

      {/* Check-in de 30 segundos */}
      <Card>
        <CardHeader>
          <CardTitle>{t("checkinTitle")}</CardTitle>
          <CardDescription>{t("checkinDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CheckinForm
            current={todayCard ? { mood: todayCard.mood, anxiety: todayCard.anxiety, sleepHours: todayCard.sleepHours, notes: todayCard.notes } : null}
            moodLabels={[1, 2, 3, 4, 5].map((n) => label("mood", n))}
          />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("last7")}</p>
            <ol className="grid grid-cols-7 gap-1.5">
              {week.map(({ key, card }) => (
                <li key={key} className="flex flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted" aria-hidden>
                    <div className="w-full rounded-md bg-brand/80" style={{ height: card ? `${card.mood * 20}%` : "0%" }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{f.weekdayShort(`${key}T12:00:00Z`)}</span>
                  <span className="sr-only">{card ? `${f.date(`${key}T12:00:00Z`)}: ${label("mood", card.mood)}` : `${f.date(`${key}T12:00:00Z`)}: ${t("noCheckin")}`}</span>
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Destaques da semana publicados pelo profissional */}
      <section aria-labelledby="highlights" className="space-y-3">
        <h2 id="highlights" className="text-card-title">
          {t("highlights")}
        </h2>
        {highlights.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHighlights")}</p>
        ) : (
          highlights.map((h) => (
            <Card key={h.id} className={h.doneAt ? "opacity-75" : ""}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 font-medium">
                    {h.kind === "task" ? <ListTodo className="h-4 w-4 text-brand" aria-hidden /> : h.kind === "material" ? <FileText className="h-4 w-4 text-brand" aria-hidden /> : <StickyNote className="h-4 w-4 text-brand" aria-hidden />}
                    {h.title}
                  </p>
                  <Badge variant={h.kind === "task" && h.doneAt ? "success" : "secondary"}>
                    {h.kind === "task" ? (h.doneAt ? t("done") : t("kind.task")) : t(`kind.${h.kind}`)}
                  </Badge>
                </div>
                {h.body ? <p className="whitespace-pre-line text-sm text-muted-foreground">{h.body}</p> : null}
                {h.dueDate ? <p className="text-xs text-muted-foreground">{t("until", { date: f.date(h.dueDate) })}</p> : null}
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline">
                    {t("openMaterial")} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
                {h.kind === "task" ? (
                  <ActionForm action={toggleTaskAction} className="space-y-2 pt-1">
                    <input type="hidden" name="highlightId" value={h.id} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="done" defaultChecked={!!h.doneAt} className="h-5 w-5 accent-primary" />
                      {t("markDone")}
                    </label>
                    <div className="flex gap-2">
                      <Input name="patientNote" defaultValue={h.patientNote ?? ""} maxLength={500} placeholder={t("taskNotePlaceholder")} aria-label={t("taskNote")} />
                      <Button type="submit" variant="outline">
                        {t("save")}
                      </Button>
                    </div>
                  </ActionForm>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {rest.length ? (
        <section aria-labelledby="more-sessions" className="space-y-2">
          <h2 id="more-sessions" className="text-card-title">
            {t("moreSessions")}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {rest.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>
                  <span className="font-medium capitalize">{f.weekdayDay(s.startsAt)}</span> · {f.time(s.startsAt)}
                  <span className="block text-muted-foreground">
                    {s.professional.fullName} · {label("modality", s.modality)}
                  </span>
                </span>
                {s.patientResponse === "confirmed" ? <Badge variant="success">{t("confirmedShort")}</Badge> : s.patientResponse === "reschedule" ? <Badge variant="warning">{t("rescheduleShort")}</Badge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {charges.length ? (
        <section aria-labelledby="payments" className="space-y-2">
          <h2 id="payments" className="text-card-title">
            {t("payments")}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span>
                  <span className="font-medium tabular-nums">{f.money(c.amount)}</span>
                  <span className="block text-muted-foreground">{t("dueOn", { date: f.date(c.dueDate) })}</span>
                </span>
                {c.paymentLink ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/pay/${c.paymentLink.token}`} target="_blank" rel="noopener noreferrer">
                      {t("pay")}
                    </a>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
