import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { CalendarPlus, FilePlus2, Receipt as ReceiptIcon, ShieldCheck, Smartphone } from "lucide-react";
import { differenceInYears } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const patient = await db.patient.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    include: {
      appointments: { include: { professional: true }, orderBy: { startsAt: "desc" }, take: 10 },
      clinicalNotes: { orderBy: { createdAt: "desc" }, take: 5 },
      charges: { orderBy: { dueDate: "desc" }, take: 10 },
      receipts: { orderBy: { issuedAt: "desc" }, take: 5 },
      consentRecords: true,
      portalAccess: true,
      dailyCards: { orderBy: { date: "desc" }, take: 7 },
    },
  });
  if (!patient) notFound();

  const totalPaid = patient.charges.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const totalOpen = patient.charges
    .filter((c) => c.status === "pending" || c.status === "overdue")
    .reduce((s, c) => s + c.amount, 0);
  const age = patient.birthDate ? differenceInYears(new Date(), patient.birthDate) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{patient.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {age !== null ? `${age} anos · ` : ""}
            {patient.phone ?? "sem telefone"} · {patient.email ?? "sem email"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link href={`/app/agenda/novo?patientId=${patient.id}`}>
              <CalendarPlus className="h-4 w-4" /> Agendar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/app/financeiro/novo?patientId=${patient.id}`}>
              <ReceiptIcon className="h-4 w-4" /> Cobrança
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/prontuario/${patient.id}/nova-evolucao`}>
              <FilePlus2 className="h-4 w-4" /> Nova evolução
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <SmallCard label="Pago histórico" value={formatBRL(totalPaid)} />
        <SmallCard label="A receber em aberto" value={formatBRL(totalOpen)} tone="warn" />
        <SmallCard label="Sessões registradas" value={String(patient.appointments.length)} />
        <SmallCard label="Anotações clínicas" value={String(patient.clinicalNotes.length)} />
      </div>

      {/* Portal & Cartões Diários */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> Portal do paciente · Cartões diários
            </CardTitle>
            <CardDescription>
              {patient.portalAccess ? (
                <>
                  Link de acesso:{" "}
                  <Link className="underline text-primary" href={`/portal/${patient.portalAccess.token}`}>
                    /portal/{patient.portalAccess.token.slice(0, 8)}…
                  </Link>
                </>
              ) : (
                "Sem portal configurado."
              )}
            </CardDescription>
          </div>
          <form action={async () => {
            "use server";
            const ctx = await requireContext();
            const { randomToken } = await import("@/lib/utils");
            await db.patientPortalAccess.upsert({
              where: { patientId: patient.id },
              create: { patientId: patient.id, token: randomToken(32) },
              update: { active: true },
            });
            await import("@/lib/audit").then((m) =>
              m.recordAudit({
                workspaceId: ctx.workspace.id,
                userId: ctx.user.id,
                action: "portal.grant",
                entity: "Patient",
                entityId: patient.id,
              }),
            );
          }}>
            <Button size="sm" variant="outline" type="submit">
              {patient.portalAccess ? "Renovar link" : "Gerar link"}
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {patient.dailyCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem cartões registrados pelo paciente. O acesso ao portal habilita o auto-monitoramento.
            </p>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {patient.dailyCards.map((d) => (
                <div key={d.id} className="rounded-md border p-2 text-center text-xs">
                  <p className="text-muted-foreground">{formatDateBR(d.date)}</p>
                  <p className="text-2xl">{moodEmoji(d.mood)}</p>
                  <p>Ansiedade {d.anxiety ?? "—"}/5</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Histórico de sessões</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Profissional</TH>
                  <TH>Status</TH>
                  <TH>Valor</TH>
                </TR>
              </THead>
              <TBody>
                {patient.appointments.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Sem sessões.
                    </TD>
                  </TR>
                ) : (
                  patient.appointments.map((a) => (
                    <TR key={a.id}>
                      <TD>{formatDateTimeBR(a.startsAt)}</TD>
                      <TD>{a.professional.fullName}</TD>
                      <TD>
                        <Badge variant={a.status === "done" ? "success" : "muted"}>{a.status}</Badge>
                      </TD>
                      <TD>{formatBRL(a.price)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Vencimento</TH>
                  <TH>Valor</TH>
                  <TH>Status</TH>
                  <TH>Método</TH>
                </TR>
              </THead>
              <TBody>
                {patient.charges.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Sem cobranças.
                    </TD>
                  </TR>
                ) : (
                  patient.charges.map((c) => (
                    <TR key={c.id}>
                      <TD>{formatDateBR(c.dueDate)}</TD>
                      <TD>{formatBRL(c.amount)}</TD>
                      <TD>
                        <Badge
                          variant={
                            c.status === "paid" ? "success" : c.status === "overdue" ? "destructive" : "muted"
                          }
                        >
                          {c.status}
                        </Badge>
                      </TD>
                      <TD className="capitalize">{c.method ?? "—"}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> LGPD · Consentimentos &amp; direitos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {patient.consentRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem registros de consentimento.</p>
            ) : (
              patient.consentRecords.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium capitalize">{r.purpose.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    Base legal: {r.legalBasis} · {r.granted ? "concedido" : "revogado"} ·{" "}
                    {formatDateTimeBR(r.grantedAt)}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Para exercer os 9 direitos do titular (acesso, portabilidade, eliminação etc.), abra a tela{" "}
            <Link className="underline" href="/app/lgpd">
              LGPD
            </Link>
            .
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SmallCard = ({ label, value, tone }: { label: string; value: string; tone?: "warn" }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "warn" ? "text-warning" : ""}`}>{value}</p>
    </CardContent>
  </Card>
);

const moodEmoji = (n: number) =>
  ["😞", "😕", "😐", "🙂", "😊"][Math.max(0, Math.min(4, n - 1))];
