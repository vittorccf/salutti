import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { whatsapp } from "@/lib/providers/whatsapp";
import { nfse } from "@/lib/providers/nfse";
import { receitaSaude } from "@/lib/providers/receita-saude";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { chargeDisplayStatus, paymentMethodLabel } from "@/lib/labels";
import { CheckCircle2, FileSignature, MessageSquareText, Receipt as ReceiptIcon } from "lucide-react";
import { isPastDue } from "@/lib/dates";
import { ensureAffected } from "@/lib/tenant";

export const dynamic = "force-dynamic";

async function markPaidAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  ensureAffected(
    await db.charge.updateMany({
      where: { id, workspaceId: ctx.workspace.id, status: { not: "paid" } },
      data: { status: "paid", paidAt: new Date() },
    }),
  );
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "charge.mark_paid",
    entity: "Charge",
    entityId: id,
  });
  redirect(`/app/financeiro/${id}`);
}

async function sendChargeReminder(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const charge = await db.charge.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { patient: true, paymentLink: true },
  });
  if (!charge || !charge.patient.phone) return;
  const overdue = isPastDue(charge.dueDate);
  await whatsapp.send({
    workspaceId: ctx.workspace.id,
    recipient: charge.patient.phone,
    template: overdue ? "charge_overdue" : "charge_due",
    vars: {
      patient: charge.patient.fullName.split(" ")[0],
      amount: formatBRL(charge.amount),
      due: formatDateBR(charge.dueDate),
      pix: charge.pixCopyPaste ?? "-",
      link: charge.paymentLink ? `https://salutti.app${charge.paymentLink.url}` : "",
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "charge.reminder",
    entity: "Charge",
    entityId: id,
  });
  redirect(`/app/financeiro/${id}`);
}

async function issueReceiptAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const id = formData.get("id") as string;
  const charge = await db.charge.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { patient: true, receipt: true, invoice: true },
  });
  if (!charge) return;

  if (!charge.receipt) {
    const seq = await db.receipt.count({ where: { workspaceId: ctx.workspace.id } });
    const num = `R${String(seq + 1).padStart(5, "0")}`;
    const rs = await receitaSaude.submit({
      receiptNumber: num,
      patientCpf: charge.patient.cpf ?? undefined,
      amount: charge.amount,
      issuedAt: new Date(),
    });
    await db.receipt.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId: charge.patientId,
        chargeId: charge.id,
        receiptNumber: num,
        amount: charge.amount,
        receitaSaudeId: rs.receitaSaudeId,
        receitaSaudeStatus: rs.receitaSaudeStatus,
      },
    });
  }
  if (!charge.invoice) {
    const seq = await db.invoice.count({ where: { workspaceId: ctx.workspace.id } });
    const num = `NFS${String(seq + 1).padStart(5, "0")}`;
    const issued = await nfse.issue({
      workspaceId: ctx.workspace.id,
      patientName: charge.patient.fullName,
      amount: charge.amount,
    });
    await db.invoice.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId: charge.patientId,
        chargeId: charge.id,
        invoiceNumber: num,
        amount: charge.amount,
        serviceCode: issued.serviceCode,
        externalId: issued.externalId,
        issStatus: issued.issStatus,
        pdfUrl: issued.pdfUrl,
        xmlUrl: issued.xmlUrl,
      },
    });
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "fiscal.issue",
    entity: "Charge",
    entityId: id,
  });
  redirect(`/app/financeiro/${id}`);
}

export default async function ChargeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const charge = await db.charge.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      patient: true,
      paymentLink: true,
      appointment: true,
      receipt: true,
      invoice: true,
    },
  });
  if (!charge) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cobrança · {formatBRL(charge.amount)}</h1>
          <p className="text-sm text-muted-foreground">
            {charge.patient.fullName} · Vencimento {formatDateBR(charge.dueDate)} ·{" "}
            <StatusBadge kind="charge" status={chargeDisplayStatus(charge.status, charge.dueDate)} />
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {charge.status !== "paid" ? (
            <form action={markPaidAction}>
              <input type="hidden" name="id" value={charge.id} />
              <Button type="submit" variant="success">
                <CheckCircle2 className="h-4 w-4" /> Confirmar pagamento
              </Button>
            </form>
          ) : null}
          <form action={sendChargeReminder}>
            <input type="hidden" name="id" value={charge.id} />
            <Button type="submit" variant="outline" disabled={!charge.patient.phone}>
              <MessageSquareText className="h-4 w-4" /> Enviar lembrete
            </Button>
          </form>
          {charge.status === "paid" && (!charge.receipt || !charge.invoice) ? (
            <form action={issueReceiptAction}>
              <input type="hidden" name="id" value={charge.id} />
              <Button type="submit">
                <FileSignature className="h-4 w-4" /> Emitir recibo e nota
              </Button>
            </form>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
            <CardDescription>
              Forma de pagamento: <strong className="text-foreground">{paymentMethodLabel(charge.method)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {charge.appointment ? (
              <p className="text-sm">
                Referente à{" "}
                <Link className="text-primary-strong underline-offset-4 hover:underline" href={`/app/agenda/${charge.appointment.id}`}>
                  sessão de {formatDateTimeBR(charge.appointment.startsAt)}
                </Link>
              </p>
            ) : null}
            {charge.pixCopyPaste ? (
              <div>
                <p className="text-sm font-semibold">Pix copia e cola</p>
                <code className="block break-all rounded-md bg-muted/30 p-2 text-xs">
                  {charge.pixCopyPaste}
                </code>
              </div>
            ) : null}
            {charge.paymentLink ? (
              <div>
                <p className="text-sm font-semibold">Link de pagamento</p>
                <Link className="break-all text-sm text-primary-strong underline-offset-4 hover:underline" href={`/pay/${charge.paymentLink.token}`} target="_blank">
                  {`/pay/${charge.paymentLink.token}`}
                </Link>
              </div>
            ) : null}
            {charge.paidAt ? (
              <p className="text-xs text-muted-foreground">Pago em {formatDateTimeBR(charge.paidAt)}.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fiscal</CardTitle>
            <CardDescription>Recibo digital, nota fiscal (NFS-e) e protocolo do Receita Saúde.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {charge.receipt ? (
              <div>
                <p className="font-medium flex items-center gap-2">
                  <ReceiptIcon className="h-4 w-4 text-primary-strong" /> Recibo {charge.receipt.receiptNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  Receita Saúde: <StatusBadge kind="receitaSaude" status={charge.receipt.receitaSaudeStatus} /> · {charge.receipt.receitaSaudeId}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhum recibo emitido. Ele é gerado depois do pagamento.</p>
            )}
            {charge.invoice ? (
              <div>
                <p className="font-medium flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-primary-strong" /> NFS-e {charge.invoice.invoiceNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  <StatusBadge kind="invoice" status={charge.invoice.issStatus} /> · ISS {charge.invoice.serviceCode}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhuma nota fiscal emitida.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
