import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { whatsapp } from "@/lib/providers/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL, formatDateTimeBR, formatTimeBR } from "@/lib/utils";
import { Calendar, MessageSquareText, Video, CheckCircle2, XCircle, FileSignature, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { modalityLabel } from "@/lib/labels";
import { ensureAffected } from "@/lib/tenant";
import { isSimulatedMeeting, meetingPlatform, video } from "@/lib/providers/video";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";

const APPOINTMENT_STATUSES = ["scheduled", "confirmed", "done", "no_show", "cancelled"] as const;

async function setStatusAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const status = String(formData.get("status"));
  if (!APPOINTMENT_STATUSES.includes(status as (typeof APPOINTMENT_STATUSES)[number])) notFound();
  ensureAffected(await db.appointment.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data: { status } }));
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
  const provider = formData.get("videoProvider") === "zoom" ? "zoom" : "google_meet";
  const appt = await db.appointment.findFirst({ where: { id, workspaceId: ctx.workspace.id, modality: "online" } });
  if (!appt) notFound();
  try {
    const meeting = await video.createMeeting({
      provider,
      topic: "Sessão · Salutti",
      startsAt: appt.startsAt,
      durationMinutes: Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000),
    });
    await db.appointment.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data: { meetingUrl: meeting.url } });
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "appointment.meeting",
      entity: "Appointment",
      entityId: id,
      metadata: { provider, simulated: meeting.simulated },
    });
  } catch (e) {
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
      when: formatDateTimeBR(appt.startsAt),
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
  searchParams: Promise<{ aviso?: string }>;
}) {
  const ctx = await requireContext();
  const { id } = await params;
  const { aviso } = await searchParams;
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary-strong" aria-hidden /> Sessão · {appt.patient.fullName}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatDateTimeBR(appt.startsAt)} até {formatTimeBR(appt.endsAt)} ·{" "}
            <StatusBadge kind="appointment" status={appt.status} />
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {appt.meetingUrl ? (
            <Button variant="outline" asChild>
              <a href={appt.meetingUrl} target="_blank" rel="noreferrer">
                <Video className="h-4 w-4" /> Entrar no {platform}
                {isSimulatedMeeting(appt.meetingUrl) ? (
                  <Badge variant="muted" className="ml-1">Simulado</Badge>
                ) : null}
              </a>
            </Button>
          ) : appt.modality === "online" ? (
            <form action={createMeetingAction} className="flex gap-2">
              <input type="hidden" name="id" value={appt.id} />
              <Select name="videoProvider" defaultValue="google_meet" aria-label="Plataforma da videochamada" className="w-auto">
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
              </Select>
              <Button type="submit" variant="outline">
                <Video className="h-4 w-4" /> Gerar link
              </Button>
            </form>
          ) : null}
          <form action={sendReminderAction}>
            <input type="hidden" name="id" value={appt.id} />
            <Button type="submit" variant="outline" disabled={!appt.patient.phone}>
              <MessageSquareText className="h-4 w-4" />
              {appt.reminderSentAt ? "Reenviar lembrete" : "Enviar lembrete"}
            </Button>
          </form>
        </div>
      </header>

      {aviso === "video" ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong">
          Não foi possível gerar o link da videochamada. Confira as credenciais em Ajustes e tente gerar de novo.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Paciente</CardTitle>
            <CardDescription>
              <Link href={`/app/pacientes/${appt.patient.id}`} className="text-primary-strong underline-offset-4 hover:underline">
                {appt.patient.fullName}
              </Link>{" "}
              · {appt.patient.phone ?? "sem telefone"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Profissional: {appt.professional.fullName}</p>
            <p className="text-sm">Modalidade: {modalityLabel(appt.modality)}</p>
            <p className="text-sm">Valor: <span className="tabular-nums">{formatBRL(appt.price)}</span></p>
            {appt.notes ? <p className="mt-2 text-sm text-muted-foreground">{appt.notes}</p> : null}
            {appt.reminderSentAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Lembrete enviado em {formatDateTimeBR(appt.reminderSentAt)}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
            <CardDescription>Atualize o status, registre a evolução ou veja a cobrança.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["confirmed", "done", "no_show", "cancelled"] as const).map((s) => (
                <form key={s} action={setStatusAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button type="submit" size="sm" variant={s === "done" ? "success" : s === "no_show" ? "destructive" : "outline"}>
                    {s === "done" ? <CheckCircle2 className="h-4 w-4" /> : s === "no_show" ? <XCircle className="h-4 w-4" /> : null}
                    {{ confirmed: "Confirmar sessão", done: "Marcar realizada", no_show: "Registrar falta", cancelled: "Cancelar sessão" }[s]}
                  </Button>
                </form>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap pt-3 border-t">
              {appt.clinicalNote ? (
                <Button variant="outline" asChild>
                  <Link href={`/app/prontuario/${appt.patient.id}`}>
                    <FileSignature className="h-4 w-4" /> Ver evolução
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={`/app/prontuario/${appt.patient.id}/nova-evolucao?appointmentId=${appt.id}`}>
                    <Sparkles className="h-4 w-4" /> Registrar evolução com o TOBI
                  </Link>
                </Button>
              )}
              {appt.charge ? (
                <Button variant="outline" asChild>
                  <Link href={`/app/financeiro/${appt.charge.id}`}>Ver cobrança</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
