import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { moduleEnabled } from "@/lib/areas";
import { requirePortalModule } from "@/lib/permissions";
import { addDaysKey } from "@/lib/payables";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { HIGHLIGHT_KINDS, MESSAGE_MAX, portalPatientScope } from "@/lib/portal";
import { cpfDigits, formatCpf } from "@/lib/cpf";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmSubmit } from "@/components/forms/confirm-submit";
import { AutoRefresh } from "@/components/auto-refresh";
import { MessageThread } from "@/components/message-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InviteBox } from "../../../portal/_components/invite-box";
import { addHighlightAction, archiveHighlightAction, replyMessageAction, revokePortalAction, setMessagesAction } from "../../../portal/_actions";

export const dynamic = "force-dynamic";

export default async function PatientPortalAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortalModule();
  const { id } = await params;
  const patient = await db.patient.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null, ...portalPatientScope(ctx) },
    include: { portalAccess: true },
  });
  if (!patient) notFound();
  const [t, f, label] = await Promise.all([getTranslations("portal.pro"), getFormat(), getTranslations("common.labels").then(labeler)]);
  const access = patient.portalAccess;
  const today = dateKeySP();

  // Abrir a conversa marca como lidas as mensagens do paciente.
  await db.portalMessage.updateMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id, fromPatient: true, readAt: null }, data: { readAt: new Date() } });
  const [messages, highlights, cards, upcoming] = await Promise.all([
    db.portalMessage.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, take: 200 }),
    db.portalHighlight.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id }, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 40 }),
    db.dailyCard.findMany({ where: { patientId: patient.id, date: { gte: parseDateOnly(addDaysKey(today, -29)) } }, orderBy: { date: "desc" } }),
    db.appointment.findMany({
      where: { patientId: patient.id, workspaceId: ctx.workspace.id, startsAt: { gte: new Date() }, status: { not: "cancelled" } },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
  ]);
  const authorIds = [...new Set([...messages.map((m) => m.authorUserId), ...highlights.map((h) => h.authorUserId)].filter((x): x is string => !!x))];
  const authors = await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const nameOf = (uid: string | null) => authors.find((a) => a.id === uid)?.name ?? "-";
  const firstName = patient.fullName.split(" ")[0];
  const status = !access || !access.active ? "off" : access.activatedAt ? "active" : access.inviteExpiresAt && access.inviteExpiresAt > new Date() ? "invited" : "off";
  const avgMood = cards.length ? cards.reduce((s, c) => s + c.mood, 0) / cards.length : null;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <Link href={`/app/pacientes/${patient.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {patient.fullName}
      </Link>
      <header>
        <h1 className="text-page-title">{t("title", { name: patient.fullName })}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Conversa */}
          <Card>
            <CardHeader>
              <CardTitle>{t("messagesTitle")}</CardTitle>
              <CardDescription>{t("messagesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-[480px] overflow-y-auto pr-1">
                <MessageThread
                  emptyText={t("noMessages")}
                  readLabel={t("read")}
                  messages={messages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    mine: !m.fromPatient,
                    author: m.fromPatient ? firstName : nameOf(m.authorUserId),
                    at: f.dateTime(m.createdAt),
                    read: !!m.readAt,
                  }))}
                />
              </div>
              {status === "active" ? (
                <ActionForm action={replyMessageAction} resetOnSuccess className="space-y-2">
                  <input type="hidden" name="patientId" value={patient.id} />
                  <Label htmlFor="reply" className="sr-only">
                    {t("reply")}
                  </Label>
                  <Textarea id="reply" name="body" rows={3} required maxLength={MESSAGE_MAX} placeholder={t("replyPlaceholder")} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{t("recordHint")}</span>
                    <Button type="submit">{t("send")}</Button>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">{t("activateFirst")}</p>
              )}
            </CardContent>
          </Card>

          {/* Destaques da semana */}
          <Card>
            <CardHeader>
              <CardTitle>{t("highlightsTitle")}</CardTitle>
              <CardDescription>{t("highlightsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ActionForm action={addHighlightAction} resetOnSuccess className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <input type="hidden" name="patientId" value={patient.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="h-kind">{t("kind")}</Label>
                  <Select id="h-kind" name="kind" defaultValue="task">
                    {HIGHLIGHT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t(`kinds.${k}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="h-due">{t("dueDate")}</Label>
                  <Input id="h-due" name="dueDate" type="date" min={today} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="h-title">{t("highlightTitle")}</Label>
                  <Input id="h-title" name="title" required minLength={2} maxLength={120} placeholder={t("highlightTitlePlaceholder")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="h-body">{t("highlightBody")}</Label>
                  <Textarea id="h-body" name="body" rows={2} maxLength={2000} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="h-url">{t("url")}</Label>
                  <Input id="h-url" name="url" type="url" placeholder="https://" />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">{t("publish")}</Button>
                </div>
              </ActionForm>
              {highlights.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noHighlights")}</p>
              ) : (
                <ul className="space-y-2">
                  {highlights.map((h) => (
                    <li key={h.id} className={`rounded-lg border p-3 text-sm ${h.archivedAt ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="flex items-center gap-2 font-medium">
                          {h.kind === "task" ? (
                            h.doneAt ? <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
                          ) : null}
                          {h.title}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{t(`kinds.${h.kind}`)}</Badge>
                          {h.kind === "task" ? <Badge variant={h.doneAt ? "success" : "warning"}>{h.doneAt ? t("doneOn", { date: f.date(h.doneAt) }) : t("pending")}</Badge> : null}
                          {h.archivedAt ? <Badge variant="muted">{t("archived")}</Badge> : null}
                        </div>
                      </div>
                      {h.body ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{h.body}</p> : null}
                      {h.url ? (
                        <a href={h.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline">
                          {h.url} <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : null}
                      {h.patientNote ? <p className="mt-2 rounded-md bg-muted p-2">{t("patientNote", { name: firstName, note: h.patientNote })}</p> : null}
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {nameOf(h.authorUserId)} · {f.date(h.createdAt)}
                          {h.dueDate ? ` · ${t("until", { date: f.date(h.dueDate) })}` : ""}
                        </span>
                        <ActionForm action={archiveHighlightAction}>
                          <input type="hidden" name="highlightId" value={h.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            {h.archivedAt ? t("restore") : t("archive")}
                          </Button>
                        </ActionForm>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Acesso */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                {t("accessTitle")}
                <Badge variant={status === "active" ? "success" : status === "invited" ? "warning" : "muted"}>{t(`status.${status}`)}</Badge>
              </CardTitle>
              <CardDescription>
                {status === "active" && access?.lastLoginAt ? t("lastLogin", { date: f.dateTime(access.lastLoginAt) }) : t("accessDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === "active" && access?.cpfDigits ? (
                <p className="text-sm">
                  {t("loginCpf", { cpf: formatCpf(access.cpfDigits) })}
                  {!cpfDigits(patient.cpf) ? <span className="block text-xs text-warning-strong">{t("cpfFromPatient")}</span> : null}
                </p>
              ) : null}
              <InviteBox
                patientId={patient.id}
                phone={patient.phone}
                firstName={firstName}
                activated={!!access?.activatedAt}
                canInvite={!!patient.birthDate || !!cpfDigits(patient.cpf)}
                editHref={`/app/pacientes/${patient.id}/editar`}
              />
              {access?.active ? (
                <div className="space-y-3 border-t pt-4">
                  <ActionForm action={setMessagesAction} className="flex items-center justify-between gap-3">
                    <input type="hidden" name="patientId" value={patient.id} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="enabled" defaultChecked={access.messagesEnabled} className="h-4 w-4 accent-primary" />
                      {t("messagesEnabled")}
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      {t("save")}
                    </Button>
                  </ActionForm>
                  <ActionForm action={revokePortalAction}>
                    <input type="hidden" name="patientId" value={patient.id} />
                    <ConfirmSubmit variant="ghost" size="sm" className="text-destructive-strong" confirmText={t("revokeConfirm", { name: firstName })}>
                      {t("revoke")}
                    </ConfirmSubmit>
                  </ActionForm>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Próximas sessões e respostas */}
          <Card>
            <CardHeader>
              <CardTitle>{t("sessionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {upcoming.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noSessions")}</p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((a) => (
                    <li key={a.id} className="space-y-1 px-6 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/app/agenda/${a.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                          {f.dateTime(a.startsAt)}
                        </Link>
                        {a.patientResponse ? (
                          <Badge variant={a.patientResponse === "confirmed" ? "success" : "warning"}>{t(`responseShort.${a.patientResponse}`)}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("response.none")}</span>
                        )}
                      </div>
                      {a.patientResponseNote ? <p className="text-muted-foreground">“{a.patientResponseNote}”</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {moduleEnabled(ctx.workspace, "cartao_diario") ? (
        <>
{/* Check-ins */}
          <Card>
            <CardHeader>
              <CardTitle>{t("checkinsTitle")}</CardTitle>
              <CardDescription>{avgMood !== null ? t("checkinsAvg", { count: cards.length, avg: f.number(Math.round(avgMood * 10) / 10) }) : t("noCheckins")}</CardDescription>
              <Link href={`/app/pacientes/${patient.id}/cartao`} className="text-sm font-medium text-brand underline-offset-4 hover:underline">
                {t("diaryOpen")}
              </Link>
            </CardHeader>
            {cards.length ? (
              <CardContent className="p-0">
                <ul className="divide-y">
                  {cards.slice(0, 14).map((c) => (
                    <li key={c.id} className="px-6 py-2.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{f.date(c.date)}</span>
                        <span className="font-medium">
                          {label("mood", c.mood)}
                          {c.anxiety ? ` · ${t("anxiety", { value: c.anxiety })}` : ""}
                          {c.sleepHours !== null ? ` · ${t("sleep", { hours: f.number(c.sleepHours) })}` : ""}
                        </span>
                      </div>
                      {c.notes ? <p className="mt-0.5 text-muted-foreground">{c.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </>
      ) : null}

              </div>
      </div>
    </div>
  );
}
