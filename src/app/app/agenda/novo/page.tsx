import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateKeySP, parseDateOnly, parseDateTimeLocal, toDateTimeLocalSP } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { createSessionMeeting, MeetAccountError, type MeetIssue } from "@/lib/video-connections";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { assertInsurancePlan } from "@/lib/tenant";
import { formatBRL } from "@/lib/utils";

const schema = z.object({
  patientId: z.string(),
  professionalId: z.string(),
  startsAt: z.string(),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  modality: z.enum(["presencial", "online"]),
  price: z.coerce.number().min(0),
  notes: z.string().optional(),
  generateCharge: z.string().optional(),
  videoProvider: z.enum(["google_meet", "zoom", "none"]).default("google_meet"),
  billing: z.string().default("particular"), // "particular" ou id do convênio
});

// Título genérico: nome do paciente não vai para Google/Zoom (dado de saúde, LGPD).
const MEETING_TOPIC = "Sessão · Salutti";

async function createAppointmentAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  await assertInWorkspace(ctx.workspace.id, { patientId: data.patientId, professionalId: data.professionalId });
  const insurancePlanId = data.billing !== "particular" ? data.billing : null;
  if (insurancePlanId) await assertInsurancePlan(ctx.workspace.id, insurancePlanId);
  // Pelo convênio, vale o valor contratado com a operadora.
  const plan = insurancePlanId ? await db.insurancePlan.findUnique({ where: { id: insurancePlanId } }) : null;
  const price = plan ? plan.sessionPrice : data.price;
  const startsAt = parseDateTimeLocal(data.startsAt);
  const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60_000);
  let meeting: { url: string; eventId: string | null; ownerId: string | null } | null = null;
  let videoIssue: MeetIssue | null = null;
  if (data.modality === "online" && data.videoProvider !== "none") {
    try {
      meeting = await createSessionMeeting({
        workspaceId: ctx.workspace.id,
        professionalId: data.professionalId,
        userId: ctx.user.id,
        provider: data.videoProvider,
        topic: MEETING_TOPIC,
        startsAt,
        durationMinutes: data.durationMinutes,
      });
    } catch (e) {
      // A sessão é criada mesmo assim; o link pode ser gerado depois na tela da sessão.
      if (e instanceof MeetAccountError) videoIssue = e.issue;
      else {
        console.error("[video] falha ao criar reunião", e);
        videoIssue = "video";
      }
    }
  }

  const appointment = await db.appointment.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: data.patientId,
      professionalId: data.professionalId,
      startsAt,
      endsAt,
      modality: data.modality,
      meetingUrl: meeting?.url ?? null,
      meetingEventId: meeting?.eventId ?? null,
      meetingOwnerId: meeting?.ownerId ?? null,
      price,
      insurancePlanId,
      notes: data.notes || null,
    },
  });

  // Sessão por convênio é paga pela operadora (lote TISS), não gera cobrança Pix.
  if (data.generateCharge === "on" && !insurancePlanId) {
    // Cobrança da sessão vence no dia da sessão (campo só de data).
    const due = parseDateOnly(dateKeySP(startsAt));
    const { pix } = await import("@/lib/providers/pix");
    const txid = pix.generateChargeId();
    const charge = await db.charge.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId: data.patientId,
        appointmentId: appointment.id,
        amount: data.price,
        method: "pix",
        dueDate: due,
        pixCopyPaste: pix.generateCopyPaste(data.price, txid),
        externalId: txid,
      },
    });
    await db.paymentLink.create({
      data: {
        workspaceId: ctx.workspace.id,
        chargeId: charge.id,
        token: txid,
        url: `/pay/${txid}`,
      },
    });
  }

  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "appointment.create",
    entity: "Appointment",
    entityId: appointment.id,
  });

  redirect(`/app/agenda/${appointment.id}${videoIssue ? `?aviso=${videoIssue}` : ""}`);
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const [patients, professionals, plans] = await Promise.all([
    db.patient.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true },
      orderBy: { fullName: "asc" },
    }),
    db.professional.findMany({
      where: { workspaceId: ctx.workspace.id, active: true },
      orderBy: { fullName: "asc" },
    }),
    db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  const defaultDate = (() => {
    // Próxima hora cheia, no horário de São Paulo.
    const d = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
    return toDateTimeLocalSP(d);
  })();


  if (professionals.length === 0 || patients.length === 0) {
    return (
      <div className="max-w-2xl">
        <EmptyState
          icon={<CalendarPlus className="h-6 w-6" />}
          title={professionals.length === 0 ? "Nenhum profissional cadastrado" : "Nenhum paciente cadastrado"}
          description={
            professionals.length === 0
              ? "Para agendar, cadastre primeiro quem atende."
              : "Para agendar, cadastre primeiro o paciente."
          }
          action={
            <Button asChild>
              <Link href={professionals.length === 0 ? "/app/equipe" : "/app/pacientes/novo"}>
                {professionals.length === 0 ? "Cadastrar profissional" : "Cadastrar paciente"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Nova sessão</CardTitle>
          <CardDescription>
            Em sessões online, escolha Google Meet ou Zoom e o link é gerado na hora. Se quiser, a cobrança Pix é criada junto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAppointmentAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="patientId">Paciente</Label>
                <Select name="patientId" id="patientId" defaultValue={params.patientId ?? ""} required>
                  <option value="">Selecione…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="professionalId">Profissional</Label>
                <Select name="professionalId" id="professionalId" required>
                  <option value="">Selecione…</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.councilType}
                      {p.councilNumber ? ` ${p.councilNumber}` : " - sem registro"})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="startsAt">Data e hora</Label>
                <Input type="datetime-local" name="startsAt" id="startsAt" defaultValue={defaultDate} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="durationMinutes">Duração (minutos)</Label>
                <Input type="number" name="durationMinutes" id="durationMinutes" defaultValue={50} min={15} max={240} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modality">Modalidade</Label>
                <Select name="modality" id="modality" defaultValue="online">
                  <option value="presencial">Presencial</option>
                  <option value="online">Online</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="videoProvider">Videochamada (sessão online)</Label>
                <Select name="videoProvider" id="videoProvider" defaultValue="google_meet">
                  <option value="google_meet">Gerar link do Google Meet</option>
                  <option value="zoom">Gerar link do Zoom</option>
                  <option value="none">Sem link por enquanto</option>
                </Select>
              </div>
              {plans.length > 0 ? (
                <div className="space-y-1">
                  <Label htmlFor="billing">Forma de pagamento</Label>
                  <Select name="billing" id="billing" defaultValue="particular">
                    <option value="particular">Particular</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        Convênio · {p.name} ({formatBRL(p.sessionPrice)})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="price">Valor particular (R$)</Label>
                <Input type="number" step="0.01" name="price" id="price" defaultValue={180} required />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="notes">Observações</Label>
                <Input name="notes" id="notes" placeholder="Opcional" />
              </div>
              <div className="sm:col-span-2 flex gap-2 items-center text-sm">
                <input id="generateCharge" name="generateCharge" type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
                <Label htmlFor="generateCharge">Criar cobrança Pix desta sessão</Label>
              </div>
            </div>
            <Button type="submit">Agendar sessão</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
