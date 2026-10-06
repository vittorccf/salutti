import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDateBR } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/labels";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

async function simulatePaymentAction(formData: FormData) {
  "use server";
  const token = formData.get("token") as string;
  const link = await db.paymentLink.findUnique({
    where: { token },
    include: { charge: true },
  });
  if (!link) return;
  await db.charge.update({
    where: { id: link.chargeId },
    data: { status: "paid", paidAt: new Date() },
  });
  redirect(`/pay/${token}?ok=1`);
}

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { token } = await params;
  const { ok } = await searchParams;
  const link = await db.paymentLink.findUnique({
    where: { token },
    include: {
      charge: { include: { patient: true } },
      workspace: true,
    },
  });
  if (!link) notFound();
  const charge = link.charge;

  return (
    <main className="min-h-screen bg-gradient-to-br from-accent/20 to-background grid place-items-center p-4">
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          <Logo variant="icon" size={48} className="mx-auto" />
          <CardTitle>Pagamento · {link.workspace.name}</CardTitle>
          <CardDescription>Pagamento seguro pela Salutti</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-card p-4 text-sm">
            <p>Cobrança para <strong>{charge.patient.fullName}</strong></p>
            <p>Vencimento: {formatDateBR(charge.dueDate)}</p>
            <p className="text-xl font-bold mt-2 tabular-nums">{formatBRL(charge.amount)}</p>
            <p className="text-muted-foreground">Forma de pagamento: {paymentMethodLabel(charge.method ?? "pix")}</p>
          </div>
          {charge.pixCopyPaste ? (
            <div>
              <p className="text-xs text-muted-foreground">Pix copia e cola</p>
              <code className="block break-all rounded-md bg-muted/30 p-2 text-xs">
                {charge.pixCopyPaste}
              </code>
            </div>
          ) : null}
          {charge.status === "paid" || ok ? (
            <div className="rounded-md bg-success/10 text-success-strong p-3 text-sm flex items-center gap-2" role="status">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Pagamento confirmado. O recibo chega em instantes.
            </div>
          ) : (
            <form action={simulatePaymentAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" className="bg-primary-strong hover:bg-primary-strong/90 w-full">Simular pagamento (sandbox)</Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Pagamento processado pela Salutti.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
