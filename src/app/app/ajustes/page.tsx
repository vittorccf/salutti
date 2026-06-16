import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, KeyRound, CreditCard, Plug } from "lucide-react";

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
          <Settings className="h-6 w-6 text-primary" /> Ajustes
        </h1>
        <p className="text-sm text-muted-foreground">Workspace · Integrações · Plano · Templates clínicos.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Identificação para emissão fiscal e comunicação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Nome:</strong> {ctx.workspace.name}</p>
            <p><strong>Slug:</strong> {ctx.workspace.slug}</p>
            <p><strong>Segmento:</strong> {ctx.workspace.segment}</p>
            <p><strong>CNPJ:</strong> {ctx.workspace.cnpj ?? "-"}</p>
            <p><strong>Plano:</strong> <Badge>{ctx.workspace.planTier}</Badge></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Certificado A1 (ICP-Brasil)
            </CardTitle>
            <CardDescription>Para assinatura de receitas e NFS-e.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>Status: <Badge variant="muted">Sandbox</Badge></p>
            <p className="text-muted-foreground mt-1">
              Em produção: upload `.pfx` cifrado em AWS KMS + verificação de validade automática (alarme 30 dias antes).
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" /> Integrações
            </CardTitle>
            <CardDescription>Cada provider tem implementação mock pronta + interface estável para chave real.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {integrations.map((i) => (
              <div key={i.name} className="rounded-md border bg-card p-3">
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-sm">{i.name}</p>
                  <Badge variant={i.status === "real" ? "success" : "muted"}>{i.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{i.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Templates de anamnese</CardTitle>
            <CardDescription>
              {templates.length} template(s) ativo(s). Editar manualmente o JSON é possível pelo Prisma Studio (
              <code>npx prisma studio</code>).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Badge variant="muted">{t.specialty ?? "geral"}</Badge>
                  <span>{t.name}</span>
                  {t.isDefault ? <Badge variant="success">padrão</Badge> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Plano Salutti
            </CardTitle>
            <CardDescription>Trial 15 dias · Sem cartão · Tier atual: {ctx.workspace.planTier}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
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
