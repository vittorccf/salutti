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
import { CalendarDays, CheckCircle2, Smartphone } from "lucide-react";
import { moodLabels, moodLabel } from "@/lib/mood";
import { modalityLabel } from "@/lib/labels";
import { Logo } from "@/components/brand/logo";

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
        <div className="container flex flex-wrap items-center justify-between gap-2 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={22} />
            <span className="text-sm font-medium text-muted-foreground">Portal do paciente</span>
          </Link>
          <Badge variant="muted">{patient.workspace.name}</Badge>
        </div>
      </header>

      <div className="container py-8 space-y-6 text-base">
        <div>
          <h1 className="text-2xl font-bold">Olá, {patient.fullName.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground">
            Aqui você vê suas sessões, pagamentos e registra como está se sentindo no cartão diário.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary-strong" aria-hidden /> Próximas sessões
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {patient.appointments.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma sessão agendada.</p>
              ) : (
                patient.appointments.map((a) => (
                  <div key={a.id} className="rounded-md border p-2">
                    <p className="font-medium">{formatDateTimeBR(a.startsAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.professional.fullName} · {modalityLabel(a.modality)}
                    </p>
                    {a.meetingUrl ? (
                      <a className="text-sm font-medium text-primary-strong underline-offset-4 hover:underline" href={a.meetingUrl} target="_blank" rel="noreferrer">
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
                <p className="text-muted-foreground">Nenhum pagamento pendente. Tudo em dia.</p>
              ) : (
                patient.charges.map((c) => (
                  <div key={c.id} className="rounded-md border p-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium tabular-nums">{formatBRL(c.amount)}</p>
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
                <p className="text-muted-foreground">Nenhum recibo ainda.</p>
              ) : (
                patient.receipts.map((r) => (
                  <div key={r.id} className="rounded-md border p-2 flex justify-between">
                    <span>{r.receiptNumber}</span>
                    <span className="tabular-nums">{formatBRL(r.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary-strong" aria-hidden /> Cartão diário
            </CardTitle>
            <CardDescription>
              Registre humor, sono e ansiedade. Quem cuida de você acompanha pela sua ficha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={submitDailyCardAction} className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-1">
                <Label htmlFor="date">Data</Label>
                <Input type="date" name="date" id="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mood">Humor</Label>
                <Select name="mood" id="mood" defaultValue="3" required>
                  {moodLabels.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {i + 1} · {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sleepHours">Sono (horas)</Label>
                <Input type="number" step="0.5" name="sleepHours" id="sleepHours" defaultValue={7} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="anxiety">Ansiedade (1 a 5)</Label>
                <Select name="anxiety" id="anxiety" defaultValue="3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2 md:col-span-4">
                <Label htmlFor="notes">Como foi seu dia? (opcional)</Label>
                <Textarea name="notes" id="notes" rows={2} />
              </div>
              <Button className="bg-primary-strong hover:bg-primary-strong/90 w-full sm:col-span-2 sm:w-auto sm:justify-self-start md:col-span-4">Salvar cartão</Button>
            </form>

            {ok ? (
              <p className="flex items-center gap-2 text-success-strong" role="status">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Cartão registrado
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {patient.dailyCards.map((d) => (
                <div key={d.id} className="rounded-md border p-2 text-center text-xs">
                  <p className="text-muted-foreground">{formatDateBR(d.date)}</p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{d.mood}/5</p>
                  <p className="font-medium">{moodLabel(d.mood)}</p>
                  {d.anxiety ? <p className="text-muted-foreground">Ansiedade {d.anxiety}/5</p> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
