import Link from "next/link";
import { startOfMonth, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateBR } from "@/lib/utils";
import { Banknote, MessageSquareText, Receipt as ReceiptIcon, PlusCircle } from "lucide-react";
import { CashflowChart } from "./_components/cashflow-chart";

export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  const ctx = await requireContext();
  const wsId = ctx.workspace.id;
  const now = new Date();

  const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(now, 5 - i)));

  const [charges, monthBuckets] = await Promise.all([
    db.charge.findMany({
      where: { workspaceId: wsId },
      include: { patient: true, paymentLink: true },
      orderBy: { dueDate: "desc" },
      take: 50,
    }),
    Promise.all(
      months.map(async (m) => {
        const next = startOfMonth(subMonths(m, -1));
        const paid = await db.charge.aggregate({
          where: { workspaceId: wsId, status: "paid", paidAt: { gte: m, lt: next } },
          _sum: { amount: true },
        });
        const expected = await db.charge.aggregate({
          where: { workspaceId: wsId, dueDate: { gte: m, lt: next } },
          _sum: { amount: true },
        });
        return {
          label: format(m, "MMM/yy", { locale: ptBR }),
          paid: paid._sum.amount ?? 0,
          expected: expected._sum.amount ?? 0,
        };
      }),
    ),
  ]);

  const totals = {
    paid: charges.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0),
    pending: charges.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0),
    overdue: charges
      .filter((c) => c.status === "pending" || c.status === "overdue")
      .filter((c) => c.dueDate < now && c.status !== "paid")
      .reduce((s, c) => s + c.amount, 0),
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Financeiro
          </h1>
          <p className="text-sm text-muted-foreground">
            Pix Automático, links de pagamento, recorrência e régua de cobrança WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/financeiro/regua">
              <MessageSquareText className="h-4 w-4" /> Régua de cobrança
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/financeiro/novo">
              <PlusCircle className="h-4 w-4" /> Nova cobrança
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Recebido (últimas 50)</p>
            <p className="mt-1 text-2xl font-semibold text-success">{formatBRL(totals.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Em aberto</p>
            <p className="mt-1 text-2xl font-semibold">{formatBRL(totals.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Atrasado</p>
            <p className="mt-1 text-2xl font-semibold text-warning">{formatBRL(totals.overdue)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo de caixa · últimos 6 meses</CardTitle>
          <CardDescription>Realizado (pago) vs Esperado (vencimentos).</CardDescription>
        </CardHeader>
        <CardContent>
          <CashflowChart data={monthBuckets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cobranças recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Paciente</TH>
                <TH>Vencimento</TH>
                <TH>Valor</TH>
                <TH>Método</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {charges.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-muted-foreground">
                    Sem cobranças.
                  </TD>
                </TR>
              ) : (
                charges.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.patient.fullName}</TD>
                    <TD>{formatDateBR(c.dueDate)}</TD>
                    <TD>{formatBRL(c.amount)}</TD>
                    <TD className="capitalize">{c.method ?? "-"}</TD>
                    <TD>
                      <Badge
                        variant={
                          c.status === "paid"
                            ? "success"
                            : c.status === "overdue"
                              ? "destructive"
                              : c.dueDate < now
                                ? "warning"
                                : "muted"
                        }
                      >
                        {c.status === "pending" && c.dueDate < now ? "overdue" : c.status}
                      </Badge>
                    </TD>
                    <TD className="flex gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/financeiro/${c.id}`}>Abrir</Link>
                      </Button>
                      {c.paymentLink ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/pay/${c.paymentLink.token}`} target="_blank">
                            <ReceiptIcon className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
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
