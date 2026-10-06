import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatBRL, plural } from "@/lib/utils";
import { Stethoscope } from "lucide-react";
import { professionalTypeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  professionalType: z.enum(["psicologo", "psicanalista", "terapeuta", "psiquiatra", "dentista", "medico"]),
  noCouncil: z.string().optional(),
  councilType: z.string().optional(),
  councilNumber: z.string().optional(),
  specialty: z.string().optional(),
  hourlyRate: z.coerce.number().optional(),
});

async function createProfessionalAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  const noCouncil = data.noCouncil === "on";
  const created = await db.professional.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email: data.email || null,
      phone: data.phone || null,
      professionalType: data.professionalType,
      noCouncil,
      councilType: noCouncil ? "sem_registro" : data.councilType || "CRP",
      councilNumber: noCouncil ? null : data.councilNumber || null,
      specialty: data.specialty || null,
      hourlyRate: data.hourlyRate || null,
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "professional.create",
    entity: "Professional",
    entityId: created.id,
  });
  redirect("/app/equipe");
}

export default async function TeamPage() {
  const ctx = await requireContext();
  const professionals = await db.professional.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { appointments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary-strong" aria-hidden /> Profissionais
        </h1>
        <p className="text-sm text-muted-foreground">
          Inclui psicanalistas, terapeutas e outras profissões sem registro de conselho.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Equipe · {plural(professionals.length, "profissional", "profissionais")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Especialidade</TH>
                  <TH>Registro</TH>
                  <TH className="text-right">Valor da hora</TH>
                  <TH className="text-right">Sessões</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {professionals.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center text-muted-foreground">
                      Nenhum profissional ainda. Cadastre o primeiro no formulário ao lado.
                    </TD>
                  </TR>
                ) : (
                  professionals.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.fullName}</TD>
                      <TD>{p.specialty ?? professionalTypeLabel(p.professionalType)}</TD>
                      <TD>
                        {p.noCouncil ? (
                          <Badge variant="muted">Sem registro</Badge>
                        ) : (
                          `${p.councilType} ${p.councilNumber ?? ""}`
                        )}
                      </TD>
                      <TD className="text-right">{p.hourlyRate ? formatBRL(p.hourlyRate) : "-"}</TD>
                      <TD className="text-right">{p._count.appointments}</TD>
                      <TD>
                        <Badge variant={p.active ? "success" : "muted"}>{p.active ? "Ativo" : "Inativo"}</Badge>
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
            <CardTitle>Adicionar profissional</CardTitle>
            <CardDescription>Para psicanalistas e terapeutas, marque “sem registro de conselho”.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProfessionalAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input name="fullName" id="fullName" required />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="professionalType">Tipo</Label>
                  <Select name="professionalType" id="professionalType" defaultValue="psicologo">
                    <option value="psicologo">Psicólogo</option>
                    <option value="psicanalista">Psicanalista</option>
                    <option value="terapeuta">Terapeuta</option>
                    <option value="psiquiatra">Psiquiatra</option>
                    <option value="dentista">Dentista</option>
                    <option value="medico">Médico</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="specialty">Especialidade</Label>
                  <Input name="specialty" id="specialty" placeholder="TCC, psicanálise, …" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="email">E-mail</Label>
                  <Input name="email" id="email" type="email" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input name="phone" id="phone" />
                </div>
              </div>
              <div className="rounded-md border p-2 text-sm flex items-center gap-2">
                <input id="noCouncil" name="noCouncil" type="checkbox" className="h-4 w-4 accent-primary" />
                <Label htmlFor="noCouncil">Sem registro de conselho (CRP/CRM)</Label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="councilType">Conselho</Label>
                  <Select name="councilType" id="councilType" defaultValue="CRP">
                    <option value="CRP">CRP</option>
                    <option value="CRM">CRM</option>
                    <option value="CRO">CRO</option>
                    <option value="sem_registro">Sem registro</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="councilNumber">Número do registro</Label>
                  <Input name="councilNumber" id="councilNumber" placeholder="06/12345" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="hourlyRate">Valor da hora (R$)</Label>
                <Input name="hourlyRate" id="hourlyRate" type="number" step="0.01" />
              </div>
              <Button type="submit" className="w-full">Cadastrar profissional</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
