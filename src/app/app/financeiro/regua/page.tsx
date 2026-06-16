import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { whatsapp } from "@/lib/providers/whatsapp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { MessageSquareText, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

async function runDunningAction() {
  "use server";
  const ctx = await requireContext();
  const overdueCharges = await db.charge.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      status: { in: ["pending", "overdue"] },
      dueDate: { lt: new Date() },
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
        link: c.paymentLink ? `https://saluti.app${c.paymentLink.url}` : "",
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
      dueDate: { lt: new Date() },
    },
    include: { patient: true },
    orderBy: { dueDate: "asc" },
  });
  const total = overdue.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareText className="h-6 w-6 text-primary" /> Régua de cobrança WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Executa o disparo de mensagens para todas as cobranças vencidas. Benchmark do setor: ~70% de recuperação.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{overdue.length} cobrança(s) elegível(is)</CardTitle>
            <CardDescription>Total: {formatBRL(total)}</CardDescription>
          </div>
          <form action={runDunningAction}>
            <Button type="submit" disabled={overdue.length === 0}>
              <Sparkles className="h-4 w-4" /> Disparar régua agora
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {params.sent ? (
            <div className="bg-success/10 text-success px-4 py-2 text-sm">
              {params.sent} mensagem(ns) enviada(s) com sucesso (mock).
            </div>
          ) : null}
          <Table>
            <THead>
              <TR>
                <TH>Paciente</TH>
                <TH>Vencimento</TH>
                <TH>Atraso</TH>
                <TH>Valor</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {overdue.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-muted-foreground">
                    Nenhuma cobrança em atraso. 🎉
                  </TD>
                </TR>
              ) : (
                overdue.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.patient.fullName}</TD>
                    <TD>{formatDateBR(c.dueDate)}</TD>
                    <TD>{differenceInDays(new Date(), c.dueDate)} dia(s)</TD>
                    <TD>{formatBRL(c.amount)}</TD>
                    <TD>
                      <Badge variant="warning">{c.status}</Badge>
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
