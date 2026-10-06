import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateTimeBR, plural } from "@/lib/utils";
import { AlertCircle, Building2, FileSignature, Landmark, Receipt as ReceiptIcon, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const ctx = await requireContext();
  const [receipts, invoices] = await Promise.all([
    db.receipt.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    }),
    db.invoice.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    }),
  ]);

  const rsConfirmed = receipts.filter((r) => r.receitaSaudeStatus === "confirmed").length;
  const rsError = receipts.filter((r) => r.receitaSaudeStatus === "error").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-primary-strong" aria-hidden /> Fiscal
        </h1>
        <p className="text-sm text-muted-foreground">
          Recibos, notas fiscais (NFS-e, LC 116, código 14.01) e protocolos do Receita Saúde.
        </p>
      </header>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning-strong mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold text-warning-strong">Receita Saúde: recibos obrigatórios desde 2025</p>
            <p className="text-muted-foreground">
              Desde janeiro de 2025, profissionais de saúde pessoa física emitem recibos pelo Receita Saúde. A Salutti
              envia o protocolo sozinha quando o recibo é gerado.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="success">{plural(rsConfirmed, "confirmado", "confirmados")}</Badge>
              <Badge variant={rsError > 0 ? "destructive" : "muted"}>{plural(rsError, "com erro", "com erro")}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-primary-strong" aria-hidden /> Recibos digitais
              </CardTitle>
              <CardDescription>Protocolo do Receita Saúde e PDF para o paciente.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Número</TH>
                  <TH>Paciente</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Receita Saúde</TH>
                </TR>
              </THead>
              <TBody>
                {receipts.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Nenhum recibo emitido. Eles são gerados quando uma cobrança é paga.
                    </TD>
                  </TR>
                ) : (
                  receipts.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono">{r.receiptNumber}</TD>
                      <TD>{r.patient.fullName}</TD>
                      <TD className="text-right">{formatBRL(r.amount)}</TD>
                      <TD>
                        <StatusBadge kind="receitaSaude" status={r.receitaSaudeStatus} />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary-strong" aria-hidden /> NFS-e
            </CardTitle>
            <CardDescription>Emitidas por API de nota fiscal (NFE.io, Focus ou Nuvem Fiscal).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Número</TH>
                  <TH>Paciente</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma nota emitida.
                    </TD>
                  </TR>
                ) : (
                  invoices.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono">{i.invoiceNumber}</TD>
                      <TD>{i.patient.fullName}</TD>
                      <TD className="text-right">{formatBRL(i.amount)}</TD>
                      <TD>
                        <StatusBadge kind="invoice" status={i.issStatus} />
                      </TD>
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
            <ShieldCheck className="h-5 w-5 text-primary-strong" aria-hidden /> Certificado digital A1
          </CardTitle>
          <CardDescription>Necessário para assinar receitas e notas fiscais (ICP-Brasil).</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Status: <StatusBadge kind="integration" status="sandbox" /> · Envie o certificado em Ajustes; ele fica
            guardado cifrado. Compatível com Memed, SafeID e BirdID.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
