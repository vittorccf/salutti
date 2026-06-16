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
import { formatBRL } from "@/lib/utils";
import { Stethoscope } from "lucide-react";

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
          <Stethoscope className="h-6 w-6 text-primary" /> Profissionais
        </h1>
        <p className="text-sm text-muted-foreground">
          Suporta psicanalistas, terapeutas e demais profissões <em>sem registro de conselho</em> - diferencial Salutti.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader>
            <CardTitle>Equipe ({professionals.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Especialidade</TH>
                  <TH>Registro</TH>
                  <TH>Valor</TH>
                  <TH>Sessões</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {professionals.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center text-muted-foreground">
                      Cadastre o primeiro profissional.
                    </TD>
                  </TR>
                ) : (
                  professionals.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.fullName}</TD>
                      <TD>{p.specialty ?? p.professionalType}</TD>
                      <TD>
                        {p.noCouncil ? (
                          <Badge variant="muted">sem registro</Badge>
                        ) : (
                          `${p.councilType} ${p.councilNumber ?? ""}`
                        )}
                      </TD>
                      <TD>{p.hourlyRate ? formatBRL(p.hourlyRate) : "-"}</TD>
                      <TD>{p._count.appointments}</TD>
                      <TD>
                        <Badge variant={p.active ? "success" : "muted"}>{p.active ? "ativo" : "inativo"}</Badge>
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
            <CardDescription>Marque "sem registro" para psicanalistas / terapeutas.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createProfessionalAction} className="space-y-3">
              <div className="space-y-1">
                <Label>Nome completo</Label>
                <Input name="fullName" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select name="professionalType" defaultValue="psicologo">
                    <option value="psicologo">Psicólogo</option>
                    <option value="psicanalista">Psicanalista</option>
                    <option value="terapeuta">Terapeuta</option>
                    <option value="psiquiatra">Psiquiatra</option>
                    <option value="dentista">Dentista</option>
                    <option value="medico">Médico</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Especialidade</Label>
                  <Input name="specialty" placeholder="TCC, psicanálise, …" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input name="email" type="email" />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input name="phone" />
                </div>
              </div>
              <div className="rounded-md border p-2 text-sm flex items-center gap-2">
                <input id="noCouncil" name="noCouncil" type="checkbox" />
                <Label htmlFor="noCouncil">Sem registro de conselho (CRP/CRM)</Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Tipo registro</Label>
                  <Select name="councilType" defaultValue="CRP">
                    <option value="CRP">CRP</option>
                    <option value="CRM">CRM</option>
                    <option value="CRO">CRO</option>
                    <option value="sem_registro">Sem registro</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input name="councilNumber" placeholder="opcional" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Valor da hora (R$)</Label>
                <Input name="hourlyRate" type="number" step="0.01" />
              </div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
