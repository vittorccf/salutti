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
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";

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
  await assertInWorkspace(ctx.workspace.id, { patientId: data.patientId });

  const txid = pix.generateChargeId();
  const dueDate = parseDateOnly(data.dueDate);
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
  const t = await getTranslations("finance.new");
  const label = labeler(await getTranslations("common.labels"));
  const params = await searchParams;
  const patients = await db.patient.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true },
    orderBy: { fullName: "asc" },
  });
  const defaultDue = dateKeySP(addDays(new Date(), 3));

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createChargeAction} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="patientId">{t("patient")}</Label>
              <Select name="patientId" id="patientId" defaultValue={params.patientId ?? ""} required>
                <option value="">{t("select")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="amount">{t("amount")}</Label>
                <Input type="number" step="0.01" name="amount" id="amount" defaultValue={200} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dueDate">{t("dueDate")}</Label>
                <Input type="date" name="dueDate" id="dueDate" defaultValue={defaultDue} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="method">{t("method")}</Label>
                <Select name="method" id="method" defaultValue="pix">
                  <option value="pix">{t("methodPix")}</option>
                  <option value="card">{t("methodCard")}</option>
                  <option value="boleto">{label("paymentMethod", "boleto")}</option>
                  <option value="dinheiro">{label("paymentMethod", "dinheiro")}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="recurringDays">{t("recurring")}</Label>
                <Input type="number" name="recurringDays" id="recurringDays" placeholder={t("recurringPlaceholder")} />
              </div>
            </div>
            <Button type="submit">{t("submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
