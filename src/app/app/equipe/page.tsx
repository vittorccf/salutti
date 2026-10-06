import Link from "next/link";
import { errorMessage } from "@/i18n/errors";
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
import { UFS } from "@/lib/labels";
import { ContactError, validEmail, validPhone } from "@/lib/contact-validation";
import { EmailInput } from "@/components/forms/email-input";
import { parseDateOnly } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { PhoneInput } from "@/components/forms/phone-input";
import { ActionForm, type FormResult } from "@/components/forms/action-form";

export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().min(2),
  professionalType: z.enum(["psicologo", "psicanalista", "terapeuta", "psiquiatra", "dentista", "medico"]),
  noCouncil: z.string().optional(),
  councilType: z.string().optional(),
  councilNumber: z.string().optional(),
  councilUF: z.string().regex(/^\d{2}$/).optional().or(z.literal("")),
  specialty: z.string().optional(),
  hourlyRate: z.coerce.number().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  userId: z.string().optional(),
});

const AUTONOMO_LIMIT =
  "Conta de profissional autônomo tem um profissional ativo. Para montar equipe, mude para clínica em Ajustes.";

const canManage = (role: string) => role === "owner" || role === "admin";
const NO_PERMISSION = "Só o dono ou um administrador gerencia os profissionais.";

const activeCount = (workspaceId: string) => db.professional.count({ where: { workspaceId, active: true } });

async function createProfessionalAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const ctx = await requireContext();
  if (!canManage(ctx.role)) return { erro: NO_PERMISSION };
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { erro: "Confira o nome, o tipo de profissional e o valor da hora." };
  const data = parsed.data;
  if (ctx.workspace.accountType === "autonomo" && (await activeCount(ctx.workspace.id)) >= 1) return { erro: AUTONOMO_LIMIT };
  // Vínculo com um usuário da Salutti (o Meet nasce na conta Google dele): precisa ser membro e não ter outro cadastro ativo.
  let userId: string | null = null;
  if (data.userId) {
    const member = await db.membership.findFirst({ where: { workspaceId: ctx.workspace.id, userId: data.userId } });
    const taken = await db.professional.count({ where: { workspaceId: ctx.workspace.id, userId: data.userId, active: true } });
    if (!member || taken) return { erro: "Esse usuário não pode ser vinculado (não é da equipe ou já tem cadastro ativo)." };
    userId = data.userId;
  }
  let email: string | null, phone: string | null;
  try {
    email = await validEmail(formData.get("email"));
    phone = validPhone(formData.get("phone"), { country: formData.get("phoneCountry") });
  } catch (e) {
    if (e instanceof ContactError) return { erro: await errorMessage(e) };
    throw e;
  }
  const noCouncil = data.noCouncil === "on";
  const created = await db.professional.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email,
      phone,
      professionalType: data.professionalType,
      noCouncil,
      councilType: noCouncil ? "sem_registro" : data.councilType || "CRP",
      councilNumber: noCouncil ? null : data.councilNumber || null,
      councilUF: noCouncil ? null : data.councilUF || null,
      specialty: data.specialty || null,
      hourlyRate: data.hourlyRate || null,
      birthDate: data.birthDate ? parseDateOnly(data.birthDate) : null,
      userId,
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

// Desativar mantém o histórico (sessões, evoluções); o profissional só some das listas de agendamento.
async function toggleProfessionalAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  if (!canManage(ctx.role)) redirect("/app/equipe?aviso=sem-permissao");
  const professionalId = String(formData.get("professionalId"));
  await assertInWorkspace(ctx.workspace.id, { professionalId });
  const current = await db.professional.findFirstOrThrow({ where: { id: professionalId, workspaceId: ctx.workspace.id } });
  if (!current.active && ctx.workspace.accountType === "autonomo" && (await activeCount(ctx.workspace.id)) >= 1) {
    redirect("/app/equipe?aviso=limite");
  }
  await db.professional.updateMany({
    where: { id: professionalId, workspaceId: ctx.workspace.id },
    data: { active: !current.active },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: current.active ? "professional.deactivate" : "professional.activate",
    entity: "Professional",
    entityId: professionalId,
  });
  revalidatePath("/app/equipe");
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const ctx = await requireContext();
  const professionals = await db.professional.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { appointments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const autonomo = ctx.workspace.accountType === "autonomo";
  const linked = new Set(professionals.filter((p) => p.active && p.userId).map((p) => p.userId));
  const members = (
    await db.membership.findMany({ where: { workspaceId: ctx.workspace.id }, include: { user: { select: { id: true, name: true, email: true } } } })
  ).filter((m) => !linked.has(m.user.id));
  const active = professionals.filter((p) => p.active).length;
  const manage = canManage(ctx.role);
  const canAdd = manage && (!autonomo || active === 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-primary-strong" aria-hidden /> Profissionais
        </h1>
        <p className="text-sm text-muted-foreground">
          {autonomo
            ? "Conta de profissional autônomo: o cadastro profissional usado nas sessões, recibos e guias."
            : "Inclui psicanalistas, terapeutas e outras profissões sem registro de conselho."}
        </p>
      </header>
      {aviso === "limite" || aviso === "sem-permissao" ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {aviso === "limite" ? AUTONOMO_LIMIT : NO_PERMISSION}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>
              {autonomo ? "Cadastro profissional" : `Equipe · ${plural(professionals.length, "profissional", "profissionais")}`}
            </CardTitle>
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
                  <TH><span className="sr-only">Ações</span></TH>
                </TR>
              </THead>
              <TBody>
                {professionals.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="text-center text-muted-foreground">
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
                      <TD className="text-right">
                        {manage ? (
                        <form action={toggleProfessionalAction}>
                          <input type="hidden" name="professionalId" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost" aria-label={`${p.active ? "Desativar" : "Reativar"} ${p.fullName}`}>
                            {p.active ? "Desativar" : "Reativar"}
                          </Button>
                        </form>
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {!manage ? null : !canAdd ? (
          <Card>
            <CardHeader>
              <CardTitle>Conta de profissional autônomo</CardTitle>
              <CardDescription>
                Esta conta tem um profissional ativo. Para cadastrar outras pessoas e trabalhar em equipe, mude o tipo da
                conta para clínica. Os pacientes, a agenda e o financeiro continuam como estão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href="/app/ajustes#tipo-de-conta">Mudar para clínica</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>{autonomo ? "Seu cadastro profissional" : "Adicionar profissional"}</CardTitle>
            <CardDescription>Para psicanalistas e terapeutas, marque “sem registro de conselho”.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createProfessionalAction} className="space-y-3">
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
              <div className="space-y-1">
                <Label htmlFor="userId">Acessa a Salutti como</Label>
                <Select name="userId" id="userId" defaultValue={autonomo ? ctx.user.id : ""}>
                  <option value="">Não acessa o sistema</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} · {m.user.email}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">O link do Google Meet das sessões é criado na conta Google dessa pessoa.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <EmailInput name="email" id="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <PhoneInput name="phone" id="phone" />
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
                <Label htmlFor="councilUF">UF do conselho</Label>
                <Select name="councilUF" id="councilUF" defaultValue="">
                  <option value="">Selecione…</option>
                  {UFS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.sigla}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="hourlyRate">Valor da hora (R$)</Label>
                  <Input name="hourlyRate" id="hourlyRate" type="number" step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="birthDate">Aniversário (lembrete no painel)</Label>
                  <Input name="birthDate" id="birthDate" type="date" />
                </div>
              </div>
              <Button type="submit" className="w-full">Cadastrar profissional</Button>
            </ActionForm>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
