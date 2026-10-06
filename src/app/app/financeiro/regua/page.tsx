import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { whatsapp } from "@/lib/providers/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { chargeDisplayStatus } from "@/lib/labels";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateBR, plural } from "@/lib/utils";
import { MessageSquareText, Sparkles } from "lucide-react";
import { daysBetweenSP, startOfTodaySP } from "@/lib/dates";

export const dynamic = "force-dynamic";

async function runDunningAction() {
  "use server";
  const ctx = await requireContext();
  const overdueCharges = await db.charge.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      status: { in: ["pending", "overdue"] },
      dueDate: { lt: startOfTodaySP() },
    },
    include: { patient: true, paymentLink: true },
  });
  let sent = 0;
  for (const c of overdueCharges) {
    if (!c.patient.phone) continue;
    await whatsapp.send({
      workspaceId: ctx.workspace.id,
      recipient: c.patient.phone,
      template: "charge_overdue",
      vars: {
        patient: c.patient.fullName.split(" ")[0],
        amount: formatBRL(c.amount),
        link: c.paymentLink ? `https://salutti.app${c.paymentLink.url}` : "",
      },
    });
    await db.charge.update({ where: { id: c.id }, data: { status: "overdue" } });
    sent++;
  }
  redirect(`/app/financeiro/regua?sent=${sent}`);
}

export default async function DunningPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const overdue = await db.charge.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      status: { in: ["pending", "overdue"] },
      dueDate: { lt: startOfTodaySP() },
    },
    include: { patient: true },
    orderBy: { dueDate: "asc" },
  });
  const total = overdue.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareText className="h-6 w-6 text-primary-strong" aria-hidden /> Régua de cobrança
        </h1>
        <p className="text-sm text-muted-foreground">
          Envia um lembrete no WhatsApp para cada cobrança vencida. A régua costuma recuperar cerca de 70% do valor.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{plural(overdue.length, "cobrança em atraso", "cobranças em atraso")}</CardTitle>
            <CardDescription>Total: {formatBRL(total)}</CardDescription>
          </div>
          <form action={runDunningAction}>
            <Button type="submit" disabled={overdue.length === 0}>
              <Sparkles className="h-4 w-4" /> Enviar lembretes
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {params.sent ? (
            <div className="bg-success/10 text-success-strong px-4 py-2 text-sm" role="status">
              {Number.isFinite(Number(params.sent))
                ? `${plural(Number(params.sent), "lembrete enviado", "lembretes enviados")} (simulação).`
                : "Lembretes enviados (simulação)."}
            </div>
          ) : null}
          <Table>
            <THead>
              <TR>
                <TH>Paciente</TH>
                <TH>Vencimento</TH>
                <TH>Atraso</TH>
                <TH className="text-right">Valor</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {overdue.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma cobrança em atraso. Quando um vencimento passar, ela aparece aqui.
                  </TD>
                </TR>
              ) : (
                overdue.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.patient.fullName}</TD>
                    <TD>{formatDateBR(c.dueDate)}</TD>
                    <TD>{plural(daysBetweenSP(c.dueDate, new Date()), "dia", "dias")}</TD>
                    <TD className="text-right">{formatBRL(c.amount)}</TD>
                    <TD>
                      <StatusBadge kind="charge" status={chargeDisplayStatus(c.status, c.dueDate)} />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
