import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseDateOnly } from "@/lib/dates";
import { Select } from "@/components/ui/select";
import { assertInsurancePlan } from "@/lib/tenant";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  birthDate: z.string().optional(),
  pronouns: z.string().optional(),
  responsibleName: z.string().optional(),
  emergencyContact: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  consent: z.string().optional(), // checkbox "on"
  insurancePlanId: z.string().optional(),
  insuranceCardNumber: z.string().trim().max(20).optional(),
});

async function createPatientAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  if (data.insurancePlanId) await assertInsurancePlan(ctx.workspace.id, data.insurancePlanId);
  const patient = await db.patient.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email: data.email || null,
      phone: data.phone || null,
      cpf: data.cpf || null,
      birthDate: data.birthDate ? parseDateOnly(data.birthDate) : null,
      pronouns: data.pronouns || null,
      responsibleName: data.responsibleName || null,
      emergencyContact: data.emergencyContact || null,
      address: data.address || null,
      notes: data.notes || null,
      insurancePlanId: data.insurancePlanId || null,
      insuranceCardNumber: data.insurancePlanId ? data.insuranceCardNumber || null : null,
      ...(data.consent === "on"
        ? {
            consentRecords: {
              create: [
                {
                  workspaceId: ctx.workspace.id,
                  purpose: "tutela_saude",
                  legalBasis: "tutela_saude",
                  granted: true,
                },
              ],
            },
          }
        : {}),
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.create",
    entity: "Patient",
    entityId: patient.id,
    metadata: { name: data.fullName },
  });
  redirect(`/app/pacientes/${patient.id}`);
}

export default async function NewPatientPage() {
  const ctx = await requireContext();
  const plans = await db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo paciente</CardTitle>
          <CardDescription>
            Só o nome é obrigatório. CPF e os demais dados podem ser preenchidos depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPatientAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo" name="fullName" required />
              <Field label="Pronomes" name="pronouns" placeholder="ele/dele, ela/dela, elu/delu…" />
              <Field label="E-mail" name="email" type="email" placeholder="nome@email.com" />
              <Field label="Telefone (WhatsApp)" name="phone" placeholder="(62) 9 9999-0000" />
              <Field label="CPF (opcional)" name="cpf" placeholder="000.000.000-00" />
              <Field label="Data de nascimento" name="birthDate" type="date" />
              <Field label="Responsável (se menor)" name="responsibleName" />
              <Field label="Contato de emergência" name="emergencyContact" />
              {plans.length > 0 ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="insurancePlanId">Convênio</Label>
                    <Select id="insurancePlanId" name="insurancePlanId" defaultValue="">
                      <option value="">Particular</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Field label="Número da carteirinha" name="insuranceCardNumber" placeholder="Só para convênio" />
                </>
              ) : null}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="notes">Observações administrativas</Label>
                <Textarea id="notes" name="notes" placeholder="Só dados administrativos. A evolução clínica vai no prontuário." />
              </div>
            </div>
            <div className="rounded-md border p-3 bg-accent/30 text-sm flex gap-3 items-start">
              <input id="consent" name="consent" type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-primary" />
              <label htmlFor="consent" className="space-y-1">
                <span className="font-medium">Confirmo a coleta com base na tutela da saúde (LGPD).</span>
                <p className="text-xs text-muted-foreground">
                  Art. 11, II, “f” da LGPD. O registro fica na trilha de auditoria com data, IP e quem cadastrou.
                </p>
              </label>
            </div>
            <Button type="submit">Cadastrar paciente</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const Field = ({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) => (
  <div className="space-y-1">
    <Label htmlFor={name}>{label}{required ? " *" : ""}</Label>
    <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
  </div>
);
