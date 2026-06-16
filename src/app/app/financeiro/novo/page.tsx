import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { pix } from "@/lib/providers/pix";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addDays } from "date-fns";

const schema = z.object({
  patientId: z.string(),
  amount: z.coerce.number().positive(),
  dueDate: z.string(),
  method: z.enum(["pix", "card", "boleto", "dinheiro"]),
  recurringDays: z.coerce.number().optional(),
});

async function createChargeAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));

  const txid = pix.generateChargeId();
  const dueDate = new Date(data.dueDate);
  const charge = await db.charge.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: data.patientId,
      amount: data.amount,
      method: data.method,
      dueDate,
      externalId: txid,
      pixCopyPaste: data.method === "pix" ? pix.generateCopyPaste(data.amount, txid) : null,
    },
  });
  await db.paymentLink.create({
    data: {
      workspaceId: ctx.workspace.id,
      chargeId: charge.id,
      token: txid,
      url: `/pay/${txid}`,
    },
  });
  if (data.recurringDays && data.recurringDays >= 7) {
    await db.subscription.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId: data.patientId,
        planName: `Recorrência (${data.recurringDays}d)`,
        amount: data.amount,
        intervalDays: data.recurringDays,
        nextChargeAt: addDays(dueDate, data.recurringDays),
      },
    });
  }
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "charge.create",
    entity: "Charge",
    entityId: charge.id,
    metadata: { amount: data.amount, method: data.method },
  });
  redirect(`/app/financeiro/${charge.id}`);
}

export default async function NewChargePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const patients = await db.patient.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true },
    orderBy: { fullName: "asc" },
  });
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 3);

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Nova cobrança</CardTitle>
          <CardDescription>
            PIX gera copia-e-cola + link de pagamento público. Recorrência cria assinatura interna.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createChargeAction} className="space-y-4">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <Select name="patientId" defaultValue={params.patientId ?? ""} required>
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" name="amount" defaultValue={200} required />
              </div>
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input type="date" name="dueDate" defaultValue={defaultDue.toISOString().slice(0, 10)} required />
              </div>
              <div className="space-y-1">
                <Label>Método</Label>
                <Select name="method" defaultValue="pix">
                  <option value="pix">Pix Automático</option>
                  <option value="card">Cartão (Stripe)</option>
                  <option value="boleto">Boleto</option>
                  <option value="dinheiro">Dinheiro</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Recorrência (dias)</Label>
                <Input type="number" name="recurringDays" placeholder="ex: 30 (mensal)" />
              </div>
            </div>
            <Button type="submit">Criar cobrança</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
