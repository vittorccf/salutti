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
import { video } from "@/lib/providers/video";

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
});

// Título genérico: nome do paciente não vai para Google/Zoom (dado de saúde, LGPD).
const MEETING_TOPIC = "Sessão · Salutti";

async function createAppointmentAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  await assertInWorkspace(ctx.workspace.id, { patientId: data.patientId, professionalId: data.professionalId });
  const startsAt = parseDateTimeLocal(data.startsAt);
  const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60_000);
  let meetingUrl: string | null = null;
  let videoFailed = false;
  if (data.modality === "online" && data.videoProvider !== "none") {
    try {
      const meeting = await video.createMeeting({
        provider: data.videoProvider,
        topic: MEETING_TOPIC,
        startsAt,
        durationMinutes: data.durationMinutes,
      });
      meetingUrl = meeting.url;
    } catch (e) {
      // A sessão é criada mesmo assim; o link pode ser gerado depois na tela da sessão.
      console.error("[video] falha ao criar reunião", e);
      videoFailed = true;
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
      meetingUrl,
      price: data.price,
      notes: data.notes || null,
    },
  });

  if (data.generateCharge === "on") {
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

  redirect(`/app/agenda/${appointment.id}${videoFailed ? "?aviso=video" : ""}`);
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const [patients, professionals] = await Promise.all([
    db.patient.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true },
      orderBy: { fullName: "asc" },
    }),
    db.professional.findMany({
      where: { workspaceId: ctx.workspace.id, active: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const defaultDate = (() => {
    // Próxima hora cheia, no horário de São Paulo.
    const d = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
    return toDateTimeLocalSP(d);
  })();

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
              <div className="space-y-1">
                <Label htmlFor="price">Valor (R$)</Label>
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
