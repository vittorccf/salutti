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

const schema = z.object({
  patientId: z.string(),
  professionalId: z.string(),
  startsAt: z.string(),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  modality: z.enum(["presencial", "online"]),
  price: z.coerce.number().min(0),
  notes: z.string().optional(),
  generateCharge: z.string().optional(),
});

async function createAppointmentAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60_000);
  const meetingUrl = data.modality === "online" ? `https://meet.saluti.app/sessao/${Math.random().toString(36).slice(2, 10)}` : null;

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
    const due = new Date(startsAt);
    due.setHours(23, 59, 59);
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

  redirect(`/app/agenda/${appointment.id}`);
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
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  })();

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Nova sessão</CardTitle>
          <CardDescription>
            Gera link de videoconsulta (modalidade online) e — opcionalmente — cobrança Pix vinculada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAppointmentAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Paciente</Label>
                <Select name="patientId" defaultValue={params.patientId ?? ""} required>
                  <option value="">Selecione…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Profissional</Label>
                <Select name="professionalId" required>
                  <option value="">Selecione…</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.councilType}
                      {p.councilNumber ? ` ${p.councilNumber}` : " — sem registro"})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data &amp; hora</Label>
                <Input type="datetime-local" name="startsAt" defaultValue={defaultDate} required />
              </div>
              <div className="space-y-1">
                <Label>Duração (min)</Label>
                <Input type="number" name="durationMinutes" defaultValue={50} min={15} max={240} required />
              </div>
              <div className="space-y-1">
                <Label>Modalidade</Label>
                <Select name="modality" defaultValue="online">
                  <option value="presencial">Presencial</option>
                  <option value="online">Online (Meet/Zoom)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" name="price" defaultValue={180} required />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Input name="notes" placeholder="Opcional" />
              </div>
              <div className="col-span-2 flex gap-2 items-center text-sm">
                <input id="generateCharge" name="generateCharge" type="checkbox" defaultChecked />
                <Label htmlFor="generateCharge">Gerar cobrança Pix automática</Label>
              </div>
            </div>
            <Button type="submit">Agendar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
