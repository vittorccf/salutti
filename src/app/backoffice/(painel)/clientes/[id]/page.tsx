import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import {
  accountTypeLabel,
  areaLabel,
  formatPlanPrice,
  memberRoleLabel,
  planLabel,
  ticketStatusLabel,
  ticketStatusVariant,
} from "@/lib/backoffice/labels";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { createSupportGrant, grantIsLive, SUPPORT_ACCESS_MINUTES, SUPPORT_USER_EMAIL } from "@/lib/support-access";
import { SupportAccessCard, type GrantResult } from "../../../_components/support-access-card";

const grantSchema = z.object({
  workspaceId: z.string().min(1),
  reason: z.string().trim().min(10, "Descreva o motivo (10 letras ou mais).").max(200),
  ticketId: z.string().optional(),
});

// Gera a senha do "Suporte Salutti" para este consultório (só admin). A senha volta uma vez para a tela; o banco guarda o hash.
async function grantAccessAction(_prev: GrantResult, formData: FormData): Promise<GrantResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const parsed = grantSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    reason: formData.get("reason"),
    ticketId: formData.get("ticketId") || undefined,
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { workspaceId, reason } = parsed.data;
  if (!(await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) return { erro: "Cliente não encontrado." };
  const ticketId =
    parsed.data.ticketId && (await db.supportTicket.findFirst({ where: { id: parsed.data.ticketId, workspaceId }, select: { id: true } }))
      ? parsed.data.ticketId
      : null;

  const { grant, password } = await createSupportGrant({ workspaceId, backofficeUserId: me.id, reason, ticketId });
  await recordBackofficeAudit({
    userId: me.id,
    action: "support.grant.create",
    entity: "SupportAccessGrant",
    entityId: grant.id,
    metadata: { workspaceId, reason, ticketId },
  });
  revalidatePath(`/backoffice/clientes/${workspaceId}`);
  return { password, email: SUPPORT_USER_EMAIL, expiresAt: grant.expiresAt.toISOString() };
}

async function revokeAccessAction(formData: FormData) {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const id = String(formData.get("grantId") ?? "");
  const grant = await db.supportAccessGrant.findUnique({ where: { id } });
  if (!grant) return;
  await db.supportAccessGrant.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordBackofficeAudit({ userId: me.id, action: "support.grant.revoke", entity: "SupportAccessGrant", entityId: id });
  revalidatePath(`/backoffice/clientes/${grant.workspaceId}`);
}

const planSchema = z.object({
  workspaceId: z.string().min(1),
  planTier: z.string().min(1),
  trialEndsAt: z.string().optional(),
});

// Mudança manual de plano (cortesia, ajuste, migração). Não cria nem cancela assinatura no Stripe.
async function changePlanAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const parsed = planSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    planTier: formData.get("planTier"),
    trialEndsAt: formData.get("trialEndsAt") || undefined,
  });
  if (!parsed.success) return { erro: "Confira os campos." };
  const { workspaceId, planTier } = parsed.data;
  const [workspace, plan] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId } }),
    db.platformPlan.findUnique({ where: { code: planTier } }),
  ]);
  if (!workspace) return { erro: "Cliente não encontrado." };
  if (!plan) return { erro: "Plano inválido." };
  if (!plan.active && plan.code !== workspace.planTier) return { erro: "Esse plano está inativo. Reative em Planos antes." };

  let trialEndsAt: Date | null = null;
  if (planTier === "trial") {
    if (!parsed.data.trialEndsAt || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.trialEndsAt)) return { erro: "Informe até quando vai o teste." };
    trialEndsAt = parseDateOnly(parsed.data.trialEndsAt);
  }

  await db.workspace.update({ where: { id: workspaceId }, data: { planTier, trialEndsAt } });
  await recordBackofficeAudit({
    userId: me.id,
    action: "workspace.plan",
    entity: "Workspace",
    entityId: workspaceId,
    metadata: { from: workspace.planTier, to: planTier, trialEndsAt: trialEndsAt?.toISOString() ?? null },
  });
  revalidatePath(`/backoffice/clientes/${workspaceId}`);
  return { ok: "Plano atualizado." };
}

export default async function ClientPage({ params, searchParams }: { params: { id: string }; searchParams: { chamado?: string } }) {
  const me = await requireBackoffice();
  const workspace = await db.workspace.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, createdAt: true, totpEnabledAt: true } } },
      },
      supportTickets: { orderBy: { lastActivityAt: "desc" }, take: 10 },
      // Só contagens: o backoffice não abre dados de pacientes.
      _count: { select: { patients: true, appointments: true, professionals: true } },
    },
  });
  if (!workspace) notFound();
  await recordBackofficeAudit({ userId: me.id, action: "workspace.view", entity: "Workspace", entityId: workspace.id });
  const [plans, grants, fromTicket] = await Promise.all([
    db.platformPlan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.supportAccessGrant.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { backofficeUser: { select: { name: true } } },
    }),
    // Vindo de um chamado (?chamado=<id>), o motivo já sai preenchido e a concessão fica ligada a ele.
    searchParams.chamado
      ? db.supportTicket.findFirst({ where: { id: searchParams.chamado, workspaceId: workspace.id }, select: { id: true, number: true, subject: true } })
      : Promise.resolve(null),
  ]);
  const grantState = (g: (typeof grants)[number]) =>
    g.revokedAt ? "Revogada" : g.endedAt ? "Encerrada" : !grantIsLive(g) ? (g.usedAt ? "Expirada (usada)" : "Expirada sem uso") : g.usedAt ? "Em uso" : "Aguardando login";

  const info = [
    ["Área", areaLabel(workspace.area)],
    ["Tipo de conta", accountTypeLabel(workspace.accountType)],
    ["CNPJ", workspace.cnpj ?? "—"],
    ["Cidade", workspace.city ? `${workspace.city}${workspace.state ? `/${workspace.state}` : ""}` : "—"],
    ["Cadastrado em", formatDateTimeBR(workspace.createdAt)],
    ["Profissionais", String(workspace._count.professionals)],
    ["Pacientes", String(workspace._count.patients)],
    ["Atendimentos", String(workspace._count.appointments)],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/backoffice/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Clientes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="text-sm text-muted-foreground">
          Plano {planLabel(workspace.planTier, plans)}
          {workspace.planTier === "trial" && workspace.trialEndsAt ? ` até ${formatDateBR(workspace.trialEndsAt)}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do consultório</CardTitle>
              <CardDescription>Contagens apenas: o backoffice não mostra dados de pacientes nem prontuários.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {info.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usuários com acesso</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Nome</TH>
                    <TH>Papel</TH>
                    <TH>2FA</TH>
                    <TH className="text-right">Desde</TH>
                  </TR>
                </THead>
                <TBody>
                  {workspace.memberships.map((m) => (
                    <TR key={m.id}>
                      <TD>
                        <span className="block font-medium">{m.user.name}</span>
                        <span className="block text-xs text-muted-foreground">{m.user.email}</span>
                      </TD>
                      <TD>{memberRoleLabel(m.role)}</TD>
                      <TD>{m.user.totpEnabledAt ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Não</Badge>}</TD>
                      <TD className="text-right text-sm">{formatDateBR(m.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chamados</CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.supportTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum chamado deste cliente.</p>
              ) : (
                <ul className="divide-y">
                  {workspace.supportTickets.map((t) => (
                    <li key={t.id}>
                      <Link prefetch={false} href={`/backoffice/chamados/${t.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-accent/40">
                        <span className="min-w-0 flex-1 truncate">
                          #{t.number} · {t.subject}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDateBR(t.lastActivityAt)}</span>
                        <Badge variant={ticketStatusVariant(t.status)}>{ticketStatusLabel(t.status)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card id="acesso">
            <CardHeader>
              <CardTitle className="text-base">Acessar conta</CardTitle>
              <CardDescription>
                Gera uma senha de {SUPPORT_ACCESS_MINUTES} minutos para o usuário oculto “Suporte Salutti” nesta conta: um login, somente
                leitura, sem prontuário, anamnese nem fotos clínicas. O cliente é avisado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {me.role === "admin" ? (
                <SupportAccessCard
                  action={grantAccessAction}
                  workspaceId={workspace.id}
                  ticketId={fromTicket?.id}
                  defaultReason={fromTicket ? `Chamado #${fromTicket.number}: ${fromTicket.subject}`.slice(0, 200) : undefined}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Só administradores acessam contas de clientes.</p>
              )}
              {grants.length > 0 ? (
                <ul className="space-y-2 border-t pt-3 text-xs">
                  {grants.map((g) => (
                    <li key={g.id} className="space-y-0.5">
                      <p className="font-medium">
                        {formatDateTimeBR(g.createdAt)} · {grantState(g)}
                      </p>
                      <p className="text-muted-foreground">
                        {g.backofficeUser?.name ?? "—"} · {g.reason}
                      </p>
                      {grantIsLive(g) && me.role === "admin" ? (
                        <form action={revokeAccessAction}>
                          <input type="hidden" name="grantId" value={g.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Revogar agora
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plano</CardTitle>
              <CardDescription>Ajuste manual (cortesia, extensão de teste). Não mexe na cobrança do Stripe: se o cliente tiver assinatura ativa lá, o próximo evento dela sobrescreve este ajuste.</CardDescription>
            </CardHeader>
            <CardContent>
              {me.role === "admin" ? (
                <ActionForm action={changePlanAction} className="space-y-3">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="planTier">Plano</Label>
                    <Select id="planTier" name="planTier" defaultValue={workspace.planTier}>
                      {plans.some((p) => p.code === workspace.planTier) ? null : (
                        <option value={workspace.planTier} disabled>
                          {planLabel(workspace.planTier, plans)}
                        </option>
                      )}
                      {plans.map((p) => (
                        <option key={p.code} value={p.code} disabled={!p.active}>
                          {p.name} · {formatPlanPrice(p)}
                          {p.active ? "" : " (inativo)"}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trialEndsAt">Teste grátis até</Label>
                    <Input
                      id="trialEndsAt"
                      name="trialEndsAt"
                      type="date"
                      defaultValue={workspace.trialEndsAt ? dateKeySP(workspace.trialEndsAt) : ""}
                    />
                    <p className="text-xs text-muted-foreground">Só vale com o plano “Teste grátis”.</p>
                  </div>
                  <Button type="submit" className="w-full">
                    Salvar plano
                  </Button>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">Só administradores mudam o plano.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
