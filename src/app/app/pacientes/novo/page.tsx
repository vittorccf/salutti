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
});

async function createPatientAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  const patient = await db.patient.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email: data.email || null,
      phone: data.phone || null,
      cpf: data.cpf || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      pronouns: data.pronouns || null,
      responsibleName: data.responsibleName || null,
      emergencyContact: data.emergencyContact || null,
      address: data.address || null,
      notes: data.notes || null,
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

export default function NewPatientPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo paciente</CardTitle>
          <CardDescription>
            CPF/CRP/registro não são obrigatórios — Salutti cobre psicanalistas e terapeutas que outros sistemas
            rejeitam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createPatientAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome completo" name="fullName" required />
              <Field label="Pronomes" name="pronouns" placeholder="ele/dele, ela/dela, elu/delu…" />
              <Field label="Email" name="email" type="email" />
              <Field label="Telefone (WhatsApp)" name="phone" placeholder="(62) 9 9999-0000" />
              <Field label="CPF" name="cpf" placeholder="opcional" />
              <Field label="Data de nascimento" name="birthDate" type="date" />
              <Field label="Responsável (se menor)" name="responsibleName" />
              <Field label="Contato de emergência" name="emergencyContact" />
              <div className="col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input id="address" name="address" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="notes">Observações administrativas</Label>
                <Textarea id="notes" name="notes" placeholder="Não usar para conteúdo clínico — registre evolução no Prontuário." />
              </div>
            </div>
            <div className="rounded-md border p-3 bg-accent/30 text-sm flex gap-3 items-start">
              <input id="consent" name="consent" type="checkbox" defaultChecked className="mt-1" />
              <label htmlFor="consent" className="space-y-1">
                <span className="font-medium">Confirmo coleta sob base legal LGPD “Tutela da Saúde”.</span>
                <p className="text-xs text-muted-foreground">
                  Art. 11, II, “f” da LGPD. Registro será armazenado no audit log com data, IP e usuário.
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
