import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { whatsapp } from "@/lib/providers/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTimeBR, formatTimeBR } from "@/lib/utils";
import { Calendar, MessageSquareText, Video, CheckCircle2, XCircle, FileSignature, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function setStatusAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  const appt = await db.appointment.update({
    where: { id },
    data: { status },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "appointment.status",
    entity: "Appointment",
    entityId: id,
    metadata: { status },
  });
  if (appt) redirect(`/app/agenda/${id}`);
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
  await db.appointment.update({ where: { id }, data: { reminderSentAt: new Date() } });
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
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireContext();
  const { id } = await params;
  const appt = await db.appointment.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { patient: true, professional: true, clinicalNote: true, charge: true },
  });
  if (!appt) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Sessão
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTimeBR(appt.startsAt)} → {formatTimeBR(appt.endsAt)} ·{" "}
            <Badge variant="muted" className="capitalize">{appt.status}</Badge>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {appt.meetingUrl ? (
            <Button variant="outline" asChild>
              <a href={appt.meetingUrl} target="_blank" rel="noreferrer">
                <Video className="h-4 w-4" /> Sala da consulta
              </a>
            </Button>
          ) : null}
          <form action={sendReminderAction}>
            <input type="hidden" name="id" value={appt.id} />
            <Button type="submit" variant="outline" disabled={!appt.patient.phone}>
              <MessageSquareText className="h-4 w-4" />
              {appt.reminderSentAt ? "Reenviar lembrete" : "Enviar lembrete WhatsApp"}
            </Button>
          </form>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Paciente</CardTitle>
            <CardDescription>
              <Link href={`/app/pacientes/${appt.patient.id}`} className="underline">
                {appt.patient.fullName}
              </Link>{" "}
              · {appt.patient.phone ?? "sem telefone"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Profissional: {appt.professional.fullName}</p>
            <p className="text-sm">Modalidade: <span className="capitalize">{appt.modality}</span></p>
            <p className="text-sm">Valor: {formatBRL(appt.price)}</p>
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
            <CardDescription>Atualize status, gere evolução clínica ou aciona financeiro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["confirmed", "done", "no_show", "cancelled"] as const).map((s) => (
                <form key={s} action={setStatusAction}>
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="status" value={s} />
                  <Button type="submit" size="sm" variant={s === "done" ? "success" : s === "no_show" ? "destructive" : "outline"}>
                    {s === "done" ? <CheckCircle2 className="h-4 w-4" /> : s === "no_show" ? <XCircle className="h-4 w-4" /> : null}
                    {{ confirmed: "Confirmar", done: "Marcar realizada", no_show: "No-show", cancelled: "Cancelar" }[s]}
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
                    <Sparkles className="h-4 w-4" /> Registrar evolução + LUMA
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
