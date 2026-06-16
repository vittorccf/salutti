import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { CalendarDays, HeartHandshake, Smartphone } from "lucide-react";

export const dynamic = "force-dynamic";

const dailyCardSchema = z.object({
  token: z.string(),
  date: z.string(),
  mood: z.coerce.number().int().min(1).max(5),
  sleepHours: z.coerce.number().optional(),
  anxiety: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

async function submitDailyCardAction(formData: FormData) {
  "use server";
  const data = dailyCardSchema.parse(Object.fromEntries(formData.entries()));
  const access = await db.patientPortalAccess.findUnique({
    where: { token: data.token },
    include: { patient: true },
  });
  if (!access || !access.active) return;

  await db.dailyCard.upsert({
    where: { patientId_date: { patientId: access.patientId, date: new Date(data.date) } },
    create: {
      patientId: access.patientId,
      workspaceId: access.patient.workspaceId,
      date: new Date(data.date),
      mood: data.mood,
      sleepHours: data.sleepHours,
      anxiety: data.anxiety,
      notes: data.notes,
    },
    update: {
      mood: data.mood,
      sleepHours: data.sleepHours,
      anxiety: data.anxiety,
      notes: data.notes,
    },
  });
  redirect(`/portal/${data.token}?ok=1`);
}

export default async function PatientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { token } = await params;
  const { ok } = await searchParams;
  const access = await db.patientPortalAccess.findUnique({
    where: { token },
    include: {
      patient: {
        include: {
          workspace: true,
          appointments: { include: { professional: true }, orderBy: { startsAt: "asc" }, take: 5 },
          charges: { where: { status: { in: ["pending", "overdue"] } }, take: 5 },
          dailyCards: { orderBy: { date: "desc" }, take: 14 },
          receipts: { orderBy: { issuedAt: "desc" }, take: 3 },
        },
      },
    },
  });
  if (!access || !access.active) notFound();
  const { patient } = access;

  return (
    <main className="min-h-screen bg-gradient-to-b from-accent/30 to-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-content-center rounded-lg bg-primary text-primary-foreground">
              <HeartHandshake className="h-5 w-5" />
            </span>
            Salutti · Portal do paciente
          </Link>
          <Badge variant="muted">{patient.workspace.name}</Badge>
        </div>
      </header>

      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Olá, {patient.fullName.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted-foreground">
            Este é seu espaço seguro: agenda, pagamentos e Cartão Diário de auto-monitoramento.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Próximas sessões
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {patient.appointments.length === 0 ? (
                <p className="text-muted-foreground">Sem sessões agendadas.</p>
              ) : (
                patient.appointments.map((a) => (
                  <div key={a.id} className="rounded-md border p-2">
                    <p className="font-medium">{formatDateTimeBR(a.startsAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.professional.fullName} · {a.modality}
                    </p>
                    {a.meetingUrl ? (
                      <a className="text-primary text-xs underline" href={a.meetingUrl} target="_blank" rel="noreferrer">
                        Entrar na sala
                      </a>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pagamentos pendentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {patient.charges.length === 0 ? (
                <p className="text-muted-foreground">Tudo em dia. 🎉</p>
              ) : (
                patient.charges.map((c) => (
                  <div key={c.id} className="rounded-md border p-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{formatBRL(c.amount)}</p>
                      <p className="text-xs text-muted-foreground">Vence {formatDateBR(c.dueDate)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recibos recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {patient.receipts.length === 0 ? (
                <p className="text-muted-foreground">Sem recibos.</p>
              ) : (
                patient.receipts.map((r) => (
                  <div key={r.id} className="rounded-md border p-2 flex justify-between">
                    <span>{r.receiptNumber}</span>
                    <span>{formatBRL(r.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> Cartão diário · auto-monitoramento
            </CardTitle>
            <CardDescription>
              Registre humor, sono e ansiedade. Seu terapeuta vê na ficha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={submitDailyCardAction} className="grid gap-3 md:grid-cols-5">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="space-y-1">
                <Label>Humor (1-5)</Label>
                <Select name="mood" defaultValue="3" required>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {["😞", "😕", "😐", "🙂", "😊"][n - 1]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sono (horas)</Label>
                <Input type="number" step="0.5" name="sleepHours" defaultValue={7} />
              </div>
              <div className="space-y-1">
                <Label>Ansiedade (1-5)</Label>
                <Select name="anxiety" defaultValue="3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-5 space-y-1">
                <Label>Como foi seu dia? (opcional)</Label>
                <Textarea name="notes" rows={2} />
              </div>
              <Button className="md:col-span-5 w-full md:w-auto">Salvar cartão</Button>
            </form>

            {ok ? <p className="text-sm text-success">Cartão registrado ✅</p> : null}

            <div className="grid grid-cols-7 gap-2">
              {patient.dailyCards.map((d) => (
                <div key={d.id} className="rounded-md border p-2 text-center text-xs">
                  <p className="text-muted-foreground">{formatDateBR(d.date)}</p>
                  <p className="text-2xl">{["😞", "😕", "😐", "🙂", "😊"][d.mood - 1]}</p>
                  {d.anxiety ? <p>Ans {d.anxiety}/5</p> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
