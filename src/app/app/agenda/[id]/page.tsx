import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { whatsapp } from "@/lib/providers/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Calendar, MessageSquareText, Video, CheckCircle2, XCircle, FileSignature, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { getFormat, getTranslations } from "@/i18n/server";
import { formatters } from "@/i18n/format";
import { labeler } from "@/i18n/labels";
import { ensureAffected } from "@/lib/tenant";
import { isSimulatedMeeting, meetingPlatform, video } from "@/lib/providers/video";
import { cancelSessionMeeting, createSessionMeeting, isMeetIssue, MEET_ISSUE_KEY, MeetAccountError } from "@/lib/video-connections";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PhoneText } from "@/components/ui/phone";
import { moduleEnabled } from "@/lib/areas";
import { canSeeClinical } from "@/lib/permissions";
import { SessionProcedure } from "@/app/app/procedimentos/_components/session-procedure";
import { CopyButton } from "@/components/copy-button";

export const dynamic = "force-dynamic";

const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "done", "no_show", "cancelled"] as const;

async function setStatusAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const status = String(formData.get("status"));
  if (!APPOINTMENT_STATUSES.includes(status as (typeof APPOINTMENT_STATUSES)[number])) notFound();
  ensureAffected(await db.appointment.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data: { status } }));
  if (status === "cancelled") {
    const appt = await db.appointment.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
    if (appt?.meetingEventId) {
      await cancelSessionMeeting(appt);
      await db.appointment.updateMany({
        where: { id, workspaceId: ctx.workspace.id },
        data: { meetingUrl: null, meetingEventId: null, meetingOwnerId: null },
      });
    }
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "appointment.status",
    entity: "Appointment",
    entityId: id,
    metadata: { status },
  });
  redirect(`/app/agenda/${id}`);
}

async function createMeetingAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const appt = await db.appointment.findFirst({ where: { id, workspaceId: ctx.workspace.id, modality: "online" } });
  if (!appt) notFound();
  try {
    const meeting = await createSessionMeeting({
      workspaceId: ctx.workspace.id,
      professionalId: appt.professionalId,
      userId: ctx.user.id,
      provider: "google_meet",
      topic: (await getTranslations("schedule.form"))("meetingTopic"),
      startsAt: appt.startsAt,
      durationMinutes: Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000),
    });
    await db.appointment.updateMany({
      where: { id, workspaceId: ctx.workspace.id },
      data: { meetingUrl: meeting.url, meetingEventId: meeting.eventId, meetingOwnerId: meeting.ownerId },
    });
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "appointment.meeting",
      entity: "Appointment",
      entityId: id,
      metadata: { provider: "google_meet", simulated: meeting.simulated },
    });
  } catch (e) {
    if (e instanceof MeetAccountError) redirect(`/app/agenda/${id}?aviso=${e.issue}`);
    console.error("[video] falha ao criar reunião", e);
    redirect(`/app/agenda/${id}?aviso=video`);
  }
  redirect(`/app/agenda/${id}`);
}

async function sendReminderAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const appt = await db.appointment.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { patient: true, professional: true },
  });
  if (!appt || !appt.patient.phone) return;
  await whatsapp.send({
    workspaceId: ctx.workspace.id,
    recipient: appt.patient.phone,
    template: "reminder_24h",
    vars: {
      patient: appt.patient.fullName.split(" ")[0],
      professional: appt.professional.fullName,
      // O modelo da mensagem ao paciente é em pt-BR (lib/providers/whatsapp), então a data vai no mesmo idioma.
      when: formatters("pt-BR").dateTime(appt.startsAt),
      meeting: appt.meetingUrl ?? "(presencial)",
    },
  });
  await db.appointment.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data: { reminderSentAt: new Date() } });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "appointment.reminder",
    entity: "Appointment",
    entityId: id,
  });
  redirect(`/app/agenda/${id}`);
}

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; registrado?: string; estornado?: string }>;
}) {
  const ctx = await requireContext();
  const t = await getTranslations("schedule.session");
  const tm = await getTranslations("schedule.meetIssues");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const { id } = await params;
  const { aviso, registrado, estornado } = await searchParams;
  const appt = await db.appointment.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { patient: true, professional: true, clinicalNote: true, charge: true },
  });
  if (!appt) notFound();
  const platform = meetingPlatform(appt.meetingUrl);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Calendar className="h-6 w-6 text-brand" aria-hidden /> {t("title", { patient: appt.patient.fullName })}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("when", { start: f.dateTime(appt.startsAt), end: f.time(appt.endsAt) })} ·{" "}
            <StatusBadge kind="appointment" status={appt.status} />
          </p>
          {appt.patientResponse ? (
            <p className={`mt-1 text-sm ${appt.patientResponse === "confirmed" ? "text-success-strong" : "text-warning-strong"}`}>
              {(await getTranslations("portal.pro.response"))(appt.patientResponse)}
              {appt.patientResponseNote && canSeeClinical(ctx) ? `: “${appt.patientResponseNote}”` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2 flex-wrap">
          {appt.meetingUrl ? (
            <>
              <Button variant="outline" asChild>
                <a href={appt.meetingUrl} target="_blank" rel="noreferrer">
                  <Video className="h-4 w-4" aria-hidden /> {t("join", { platform: !platform || platform === "Videochamada" ? t("videoCall") : platform })}
                  {isSimulatedMeeting(appt.meetingUrl) ? (
                    <Badge variant="muted" className="ml-1">{t("simulated")}</Badge>
                  ) : null}
                </a>
              </Button>
              <CopyButton text={appt.meetingUrl} label={t("copyLink")} copiedLabel={t("linkCopied")} />
            </>
          ) : appt.modality === "online" ? (
            <form action={createMeetingAction} className="flex gap-2">
              <input type="hidden" name="id" value={appt.id} />
              <Button type="submit" variant="outline">
                <Video className="h-4 w-4" aria-hidden /> {t("generateLink")}
              </Button>
            </form>
          ) : null}
          <form action={sendReminderAction}>
            <input type="hidden" name="id" value={appt.id} />
            <Button type="submit" variant="outline" disabled={!appt.patient.phone}>
              <MessageSquareText className="h-4 w-4" aria-hidden />
              {appt.reminderSentAt ? t("resendReminder") : t("sendReminder")}
            </Button>
          </form>
        </div>
      </header>

      {isMeetIssue(aviso) ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong">
          {tm(MEET_ISSUE_KEY[aviso])}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("patient")}</CardTitle>
            <CardDescription>
              <Link href={`/app/pacientes/${appt.patient.id}`} className="text-brand underline-offset-4 hover:underline">
                {appt.patient.fullName}
              </Link>{" "}
              · <PhoneText value={appt.patient.phone} fallback={t("noPhone")} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{t("professional", { name: appt.professional.fullName })}</p>
            <p className="text-sm">{t("modality", { modality: label("modality", appt.modality) })}</p>
            <p className="text-sm">{t("price")} <span className="tabular-nums">{f.money(appt.price)}</span></p>
            {/* Observação livre pode ter conteúdo clínico: oculta no acesso de suporte. */}
            {appt.notes && !ctx.support ? <p className="mt-2 text-sm text-muted-foreground">{appt.notes}</p> : null}
            {appt.reminderSentAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("reminderSent", { date: f.dateTime(appt.reminderSentAt) })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("actions")}</CardTitle>
            <CardDescription>{t("actionsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["confirmed", "done", "no_show", "cancelled"] as const).map((s) => (
                <form key={s} action={setStatusAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button type="submit" size="sm" variant="outline">
                    {s === "done" ? <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden /> : s === "no_show" ? <XCircle className="h-4 w-4 text-destructive-strong" aria-hidden /> : null}
                    {t(({ confirmed: "confirm", done: "done", no_show: "noShow", cancelled: "cancel" } as const)[s])}
                  </Button>
                </form>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap pt-3 border-t">
              {appt.clinicalNote ? (
                <Button variant="outline" asChild>
                  <Link href={`/app/prontuario/${appt.patient.id}`}>
                    <FileSignature className="h-4 w-4" aria-hidden /> {t("viewNote")}
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={`/app/prontuario/${appt.patient.id}/nova-evolucao?appointmentId=${appt.id}`}>
                    <Sparkles className="h-4 w-4" aria-hidden /> {t("newNote")}
                  </Link>
                </Button>
              )}
              {appt.charge ? (
                <Button variant="outline" asChild>
                  <Link href={`/app/financeiro/${appt.charge.id}`}>{t("viewCharge")}</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salutti Estética: procedimento, termo, insumos aplicados, margem e retorno (só equipe clínica). */}
      {moduleEnabled(ctx.workspace, "procedimentos") && canSeeClinical(ctx) && appt.procedureId ? (
        <SessionProcedure appt={appt} recorded={registrado === "1"} reversed={estornado === "1"} />
      ) : null}
    </div>
  );
}
