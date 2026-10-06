import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Settings, KeyRound, CreditCard, Plug } from "lucide-react";
import { plural } from "@/lib/utils";
import { planTierLabel, segmentLabel } from "@/lib/labels";
import { videoStatus } from "@/lib/providers/video";
import { ANAMNESIS_LIBRARY } from "@/lib/anamnesis-library";
import { addLibraryTemplatesAction } from "../_actions/anamnesis";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PLANS, billingConfigured, type PaidPlan } from "@/lib/providers/billing";
import { billingPortalAction, subscribeAction } from "../_actions/billing";
import { changeAccountTypeAction, updateProfileAction, updateWorkspaceAction } from "../_actions/account";
import { ActionForm } from "@/components/forms/action-form";
import { AddressFields } from "@/components/forms/address-fields";
import { Input } from "@/components/ui/input";
import { ACCOUNT_TYPES, autonomoBlockers, isAccountType } from "@/lib/account";
import { dateKeySP } from "@/lib/dates";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, { tone: "ok" | "erro"; text: string }> = {
  ok: { tone: "ok", text: "Assinatura confirmada. O plano é atualizado em instantes." },
  simulada: { tone: "ok", text: "Plano ativado em modo de teste (sem cobrança)." },
  erro: { tone: "erro", text: "Não foi possível abrir a cobrança. Confira as chaves do Stripe e tente de novo." },
  "sem-permissao": { tone: "erro", text: "Só quem é dono do consultório pode mudar o plano." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ assinatura?: string }> }) {
  const ctx = await requireContext();
  const { assinatura } = await searchParams;
  const aviso = assinatura && Object.hasOwn(AVISOS, assinatura) ? AVISOS[assinatura] : null;
  const isOwner = ctx.role === "owner";
  const ws = ctx.workspace;
  const accountType = isAccountType(ws.accountType) ? ws.accountType : "autonomo";
  const isClinic = accountType === "clinica";
  const canEditWorkspace = ctx.role === "owner" || ctx.role === "admin";
  const [templates, activeProfessionals, members] = await Promise.all([
    db.anamnesisTemplate.findMany({ where: { workspaceId: ws.id } }),
    db.professional.count({ where: { workspaceId: ws.id, active: true } }),
    db.membership.count({ where: { workspaceId: ws.id, role: { notIn: ["receptionist", "financial"] } } }),
  ]);
  const blockers = isClinic ? autonomoBlockers({ activeProfessionals, members }) : [];

  const integrations = [
    {
      name: "Stripe Billing",
      desc: "Assinaturas SaaS + cartão recorrente",
      status: billingConfigured() ? "real" : "sandbox",
    },
    {
      name: "Google Meet",
      desc: "Link de videochamada pelo Google Agenda",
      status: videoStatus.google_meet(),
    },
    {
      name: "Zoom",
      desc: "Link de videochamada pela API do Zoom",
      status: videoStatus.zoom(),
    },
    {
      name: "Asaas / Iugu",
      desc: "Pix Automático e boleto",
      status: process.env.ASAAS_API_KEY?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "NFE.io / Focus NF-e",
      desc: "Emissão NFS-e por município",
      status: process.env.NFEIO_API_KEY?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "WhatsApp Business (Meta)",
      desc: "Lembretes e régua de cobrança",
      status: process.env.WHATSAPP_BUSINESS_TOKEN?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "Receita Saúde (Receita Federal)",
      desc: "Envio automático de recibos a partir de Jan/2025",
      status: process.env.RECEITA_SAUDE_TOKEN?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "OpenAI (TOBI)",
      desc: "Sumarização e insights generativos",
      status: process.env.OPENAI_API_KEY ? "real" : "heurístico",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary-strong" aria-hidden /> Ajustes
        </h1>
        <p className="text-sm text-muted-foreground">
          Seu perfil, dados {isClinic ? "da clínica" : "do consultório"}, tipo de conta, integrações, modelos de anamnese e plano.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seu perfil</CardTitle>
            <CardDescription>Vale em todas as contas que você acessa. O aniversário aparece no painel.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfileAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="profile-name">Nome</Label>
                <Input id="profile-name" name="name" required defaultValue={ctx.user.name} autoComplete="name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-birthDate">Aniversário</Label>
                <Input id="profile-birthDate" name="birthDate" type="date" defaultValue={ctx.user.birthDate ? dateKeySP(ctx.user.birthDate) : ""} />
                <p className="text-xs text-muted-foreground">Usado só para o lembrete no painel da equipe.</p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="showPatientBirthdays"
                  defaultChecked={ctx.user.showPatientBirthdays}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  Mostrar no painel os aniversários dos meus pacientes
                  <span className="block text-xs text-muted-foreground">
                    Na clínica, só os pacientes que você atende. Lembrar a data é uma escolha sua e do seu enquadre.
                  </span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">E-mail de acesso: {ctx.user.email}</p>
              <Button type="submit" variant="outline" size="sm">Salvar perfil</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="tipo-de-conta" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Tipo de conta</CardTitle>
            <CardDescription>
              Atual: <strong className="text-foreground">{ACCOUNT_TYPES[accountType].label}</strong> · {segmentLabel(ws.segment)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{ACCOUNT_TYPES[accountType].description}</p>
            {ctx.role !== "owner" ? (
              <p className="text-muted-foreground">Só quem é dono da conta pode mudar o tipo.</p>
            ) : (
              <ActionForm action={changeAccountTypeAction} className="space-y-3">
                <input type="hidden" name="to" value={isClinic ? "autonomo" : "clinica"} />
                <p>
                  {isClinic
                    ? "Virar conta de profissional autônomo: a conta passa a ter um profissional ativo."
                    : "Virar clínica: libera cadastrar vários profissionais e trabalhar em equipe."}{" "}
                  Pacientes, agenda, prontuários e financeiro continuam como estão.
                </p>
                {isClinic ? (
                  <p className="rounded-md border p-3 text-muted-foreground">
                    Prontuários de profissionais desativados continuam guardados nesta conta e passam a ficar sob sua
                    gestão. A guarda é de no mínimo 5 anos (Res. CFP 001/2009). Combine com quem atendeu antes de mudar.
                  </p>
                ) : null}
                {blockers.length ? (
                  <p className="rounded-md bg-warning/10 p-3 text-warning-strong">
                    Antes de mudar: {blockers.join("; ")}.
                  </p>
                ) : null}
                <Button type="submit" variant="outline" size="sm" disabled={blockers.length > 0}>
                  {isClinic ? "Mudar para profissional autônomo" : "Mudar para clínica"}
                </Button>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{isClinic ? "Dados da clínica" : "Dados do consultório"}</CardTitle>
            <CardDescription>
              Usados nas notas fiscais, nas guias TISS e nas mensagens aos pacientes. Endereço curto: {ws.slug} · Plano{" "}
              <Badge>{planTierLabel(ws.planTier)}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canEditWorkspace ? (
              <ActionForm action={updateWorkspaceAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="ws-name">{isClinic ? "Nome da clínica" : "Nome do consultório"}</Label>
                    <Input id="ws-name" name="name" required defaultValue={ws.name} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ws-cnpj">CNPJ{isClinic ? "" : " (se atende como empresa)"}</Label>
                    <Input id="ws-cnpj" name="cnpj" defaultValue={ws.cnpj ?? ""} placeholder="00.000.000/0000-00" autoCapitalize="characters" />
                  </div>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Endereço</legend>
                  <AddressFields idPrefix="ws-" defaultValue={ws} />
                </fieldset>
                <Button type="submit" variant="outline" size="sm">Salvar dados</Button>
              </ActionForm>
            ) : (
              <div className="space-y-1 text-sm">
                <p><strong>Nome:</strong> {ws.name}</p>
                <p><strong>CNPJ:</strong> {ws.cnpj ?? "-"}</p>
                <p className="text-muted-foreground">Só o dono ou um administrador altera estes dados.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary-strong" aria-hidden /> Certificado A1 (ICP-Brasil)
            </CardTitle>
            <CardDescription>Para assinatura de receitas e NFS-e.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>Status: <StatusBadge kind="integration" status="sandbox" /></p>
            <p className="text-muted-foreground mt-1">
              O arquivo .pfx fica guardado cifrado, e você recebe um aviso 30 dias antes do vencimento.
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary-strong" aria-hidden /> Integrações
            </CardTitle>
            <CardDescription>Integrações em sandbox funcionam com dados simulados até você informar a chave real.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((i) => (
              <div key={i.name} className="rounded-md border bg-card p-3">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-sm">{i.name}</p>
                  <StatusBadge kind="integration" status={i.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{i.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Modelos de anamnese</CardTitle>
            <CardDescription>
              {plural(templates.length, "modelo ativo", "modelos ativos")}. Adicione outros da biblioteca abaixo; a edição
              das perguntas ainda é feita pelo Prisma Studio (<code>npx prisma studio</code>).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Badge variant="outline">{t.specialty ?? "Geral"}</Badge>
                  <span>{t.name}</span>
                  {t.isDefault ? <Badge variant="success">Padrão</Badge> : null}
                </li>
              ))}
            </ul>
            <form action={addLibraryTemplatesAction} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="back" value="ajustes" />
              <div className="space-y-1">
                <Label htmlFor="slug">Biblioteca de modelos</Label>
                <Select id="slug" name="slug" className="w-auto">
                  {ANAMNESIS_LIBRARY.filter((t) => !templates.some((x) => x.name === t.name)).map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="outline" disabled={ANAMNESIS_LIBRARY.every((t) => templates.some((x) => x.name === t.name))}>
                Adicionar da biblioteca
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary-strong" aria-hidden /> Plano Salutti
            </CardTitle>
            <CardDescription>
              Plano atual: <strong className="text-foreground">{planTierLabel(ctx.workspace.planTier)}</strong>
              {billingConfigured() ? " · cobrança pelo Stripe" : " · Stripe em modo de teste: a ativação é simulada"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {aviso ? (
              <p
                role={aviso.tone === "erro" ? "alert" : "status"}
                className={
                  aviso.tone === "erro"
                    ? "rounded-md bg-destructive/10 p-3 text-destructive-strong"
                    : "rounded-md bg-success/10 p-3 text-success-strong"
                }
              >
                {aviso.text}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(PLANS) as PaidPlan[]).map((key) => {
                const p = PLANS[key];
                const current = ctx.workspace.planTier === key;
                return (
                  <div key={key} className={current ? "rounded-md border border-primary p-3" : "rounded-md border p-3"}>
                    <p className="font-semibold">
                      {p.name} · {p.price}
                    </p>
                    <p className="text-muted-foreground">{p.description}</p>
                    {current ? (
                      <Badge variant="success" className="mt-3">Plano atual</Badge>
                    ) : isOwner ? (
                      <form action={subscribeAction} className="mt-3">
                        <input type="hidden" name="plan" value={key} />
                        <Button type="submit" size="sm" variant={key === "pro" ? "default" : "outline"}>
                          {billingConfigured() ? `Assinar ${p.name}` : `Ativar ${p.name} (simulação)`}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              <div className="rounded-md border p-3">
                <p className="font-semibold">Clínica · sob consulta</p>
                <p className="text-muted-foreground">Multiprofissional · TISS · vários CNPJs</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <a href="mailto:contato@salutti.app?subject=Plano%20Cl%C3%ADnica">Falar com a equipe</a>
                </Button>
              </div>
            </div>
            {isOwner && billingConfigured() && (ctx.workspace.planTier === "starter" || ctx.workspace.planTier === "pro") ? (
              <form action={billingPortalAction}>
                <Button type="submit" variant="outline" size="sm">
                  Gerenciar assinatura e faturas
                </Button>
              </form>
            ) : null}
            {!isOwner ? <p className="text-muted-foreground">Só quem é dono do consultório pode mudar o plano.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
