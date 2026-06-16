import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatBRL, formatDateTimeBR } from "@/lib/utils";
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
          <FileSignature className="h-6 w-6 text-primary" /> Fiscal
        </h1>
        <p className="text-sm text-muted-foreground">
          NFS-e (LC 116, código 14.01) · Recibos · Receita Saúde (obrigatória 01/2025) · Certificado A1 placeholder.
        </p>
      </header>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
          <div>
            <p className="font-semibold text-warning-foreground">Receita Saúde 2025 - gatilho de venda</p>
            <p className="text-muted-foreground">
              A partir de Jan/2025, profissionais de saúde PF devem emitir recibos via app Receita Saúde da Receita
              Federal. Salutti envia o protocolo automaticamente quando o recibo é gerado.
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              <Badge variant="success">{rsConfirmed} confirmados</Badge>
              <Badge variant="warning">{rsError} erro</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-primary" /> Recibos digitais
              </CardTitle>
              <CardDescription>Receita Saúde + PDF público.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Número</TH>
                  <TH>Paciente</TH>
                  <TH>Valor</TH>
                  <TH>Receita Saúde</TH>
                </TR>
              </THead>
              <TBody>
                {receipts.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Sem recibos emitidos.
                    </TD>
                  </TR>
                ) : (
                  receipts.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono">{r.receiptNumber}</TD>
                      <TD>{r.patient.fullName}</TD>
                      <TD>{formatBRL(r.amount)}</TD>
                      <TD>
                        <Badge variant={r.receitaSaudeStatus === "confirmed" ? "success" : "warning"}>
                          {r.receitaSaudeStatus ?? "-"}
                        </Badge>
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
              <Building2 className="h-5 w-5 text-primary" /> NFS-e
            </CardTitle>
            <CardDescription>Emissão via API "NF-e as a service" (NFE.io / Focus / Nuvem Fiscal).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Número</TH>
                  <TH>Paciente</TH>
                  <TH>Valor</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Sem notas emitidas.
                    </TD>
                  </TR>
                ) : (
                  invoices.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono">{i.invoiceNumber}</TD>
                      <TD>{i.patient.fullName}</TD>
                      <TD>{formatBRL(i.amount)}</TD>
                      <TD>
                        <Badge variant={i.issStatus === "issued" ? "success" : "warning"}>{i.issStatus}</Badge>
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
            <ShieldCheck className="h-5 w-5 text-primary" /> Certificado digital A1
          </CardTitle>
          <CardDescription>Necessário para assinar receitas e NFS-e em produção (ICP-Brasil).</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Status: <Badge variant="muted">Sandbox</Badge> · Salutti aceita upload em <code>/app/ajustes</code> e
            armazena cifrado (KMS). Integrações suportadas: Memed, SafeID, BirdID.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
