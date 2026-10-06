import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Settings, KeyRound, CreditCard, Plug } from "lucide-react";
import { plural } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireContext();
  const templates = await db.anamnesisTemplate.findMany({
    where: { workspaceId: ctx.workspace.id },
  });

  const integrations = [
    {
      name: "Stripe Billing",
      desc: "Assinaturas SaaS + cartão recorrente",
      status: process.env.STRIPE_SECRET_KEY?.startsWith("sk_") && !process.env.STRIPE_SECRET_KEY.includes("mock")
        ? "real"
        : "sandbox",
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
      name: "OpenAI (LUMA)",
      desc: "Sumarização e insights generativos",
      status: process.env.OPENAI_API_KEY ? "real" : "heurístico",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary-strong" /> Ajustes
        </h1>
        <p className="text-sm text-muted-foreground">Dados do consultório, integrações, modelos de anamnese e plano.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Consultório</CardTitle>
            <CardDescription>Dados usados nas notas fiscais e nas mensagens aos pacientes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Nome:</strong> {ctx.workspace.name}</p>
            <p><strong>Endereço curto:</strong> {ctx.workspace.slug}</p>
            <p><strong>Segmento:</strong> {ctx.workspace.segment.replaceAll("_", " ")}</p>
            <p><strong>CNPJ:</strong> {ctx.workspace.cnpj ?? "-"}</p>
            <p><strong>Plano:</strong> <Badge>{ctx.workspace.planTier}</Badge></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary-strong" /> Certificado A1 (ICP-Brasil)
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
              <Plug className="h-5 w-5 text-primary-strong" /> Integrações
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
              {plural(templates.length, "modelo ativo", "modelos ativos")}. Por enquanto a edição é feita pelo Prisma
              Studio (<code>npx prisma studio</code>).
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
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary-strong" /> Plano Salutti
            </CardTitle>
            <CardDescription>Teste grátis de 15 dias, sem cartão · Plano atual: {ctx.workspace.planTier}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-semibold">Starter - R$ 49/mês</p>
              <p className="text-muted-foreground">Solo · até 50 pacientes ativos</p>
            </div>
            <div className="rounded-md border p-3 border-primary">
              <p className="font-semibold">Pro - R$ 129/mês</p>
              <p className="text-muted-foreground">Solo + IA preditiva ilimitada</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-semibold">Clínica - sob consulta</p>
              <p className="text-muted-foreground">Multi-profissional · TISS · multi-CNPJ</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
