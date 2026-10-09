import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import { formatPlanPrice, intervalLabel } from "@/lib/backoffice/labels";
import { billing, billingConfigured, stripeMode, syncStripe } from "@/lib/providers/billing";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Preço digitado como "49,90" ou "49.90" vira centavos.
const toCents = (value: string) => {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  price: z.string().trim(),
  trialDays: z.string().optional(),
  description: z.string().trim().max(300).optional(),
  stripePriceId: z.string().trim().regex(/^price_\w+$/).optional(),
  active: z.boolean(),
});

async function updatePlanAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const parsed = schema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    price: formData.get("price") ?? "0",
    trialDays: formData.get("trialDays") || undefined,
    description: formData.get("description") || undefined,
    stripePriceId: formData.get("stripePriceId") || undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return parsed.error.issues.some((i) => i.path[0] === "stripePriceId")
      ? { erro: "O ID do preço do Stripe começa com price_ (copie em Catálogo de produtos → preço)." }
      : { erro: "Confira o nome do plano (2 a 60 caracteres)." };
  }
  const plan = await db.platformPlan.findUnique({ where: { id: parsed.data.id } });
  if (!plan) return { erro: "Plano não encontrado." };

  const priceCents = plan.interval === "trial" ? 0 : toCents(parsed.data.price);
  if (Number.isNaN(priceCents)) return { erro: "Preço inválido. Use o formato 49,90." };
  const trialDays = plan.interval === "trial" ? Number(parsed.data.trialDays ?? plan.trialDays ?? 15) : null;
  if (trialDays !== null && (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 90)) {
    return { erro: "Dias de teste: de 1 a 90." };
  }

  // O preço do Stripe precisa cobrar exatamente o que o catálogo mostra (valor, reais, mensal/anual).
  const stripePriceId = plan.interval === "trial" ? null : (parsed.data.stripePriceId ?? null);
  if (stripePriceId) {
    if (!billingConfigured()) return { erro: "Configure a STRIPE_SECRET_KEY na Vercel antes de vincular preços." };
    const taken = await db.platformPlan.findFirst({ where: { stripePriceId, id: { not: plan.id } }, select: { name: true } });
    if (taken) return { erro: `Esse preço já está no plano ${taken.name}.` };
    const mismatch = await billing.checkPrice(stripePriceId, { priceCents, interval: plan.interval });
    if (mismatch) return { erro: mismatch };
  }

  await db.platformPlan.update({
    where: { id: plan.id },
    data: {
      name: parsed.data.name,
      priceCents,
      trialDays,
      description: parsed.data.description ?? null,
      stripePriceId,
      active: parsed.data.active,
    },
  });
  await recordBackofficeAudit({
    userId: me.id,
    action: "plan.update",
    entity: "PlatformPlan",
    entityId: plan.id,
    metadata: {
      code: plan.code,
      from: { name: plan.name, priceCents: plan.priceCents, active: plan.active, stripePriceId: plan.stripePriceId },
      to: { name: parsed.data.name, priceCents, active: parsed.data.active, stripePriceId },
    },
  });
  revalidatePath("/backoffice/planos");
  return { ok: `Plano ${parsed.data.name} salvo.` };
}

// Cria (ou reaproveita) no Stripe os preços dos planos pagos, liga cada um ao seu plano e confere webhook e portal.
async function syncStripeAction(): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  if (!billingConfigured()) return { erro: "Configure a STRIPE_SECRET_KEY na Vercel antes de sincronizar." };
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) return { erro: "Configure a APP_URL na Vercel (ex.: https://salutti.vercel.app): o webhook e o portal usam esse endereço." };

  const plans = await db.platformPlan.findMany({ orderBy: { sortOrder: "asc" } });
  let report;
  try {
    report = await syncStripe(plans, appUrl);
  } catch (e) {
    return { erro: `O Stripe recusou: ${(e as Error).message}` };
  }
  // stripePriceId é único: solta os vínculos antigos antes de gravar os novos.
  await db.$transaction([
    db.platformPlan.updateMany({ where: { code: { in: report.prices.map((p) => p.code) } }, data: { stripePriceId: null } }),
    ...report.prices.map((p) => db.platformPlan.update({ where: { code: p.code }, data: { stripePriceId: p.priceId } })),
  ]);
  await recordBackofficeAudit({
    userId: me.id,
    action: "plan.stripe-sync",
    entity: "PlatformPlan",
    entityId: "catalogo",
    metadata: {
      mode: report.mode,
      prices: report.prices.map(({ code, priceId, created }) => ({ code, priceId, created })),
      webhook: report.webhook.status,
      portal: report.portal,
    },
  });
  revalidatePath("/backoffice/planos");

  const created = report.prices.filter((p) => p.created).map((p) => p.name);
  const parts = [
    `Stripe em modo ${report.mode}: ${report.prices.length} plano${report.prices.length === 1 ? "" : "s"} vinculado${report.prices.length === 1 ? "" : "s"}${created.length ? ` (preço novo: ${created.join(", ")})` : ""}.`,
    `Portal do cliente ${report.portal}.`,
  ];
  if (report.webhook.status === "criado") {
    parts.push(
      `Webhook criado em ${report.webhook.url}. Copie o segredo ${report.webhook.secret} para STRIPE_WEBHOOK_SECRET na Vercel e publique de novo: ele não aparece outra vez.`,
    );
  } else if (report.webhook.status === "desativado") {
    return { erro: `${parts.join(" ")} O webhook ${report.webhook.url} está desativado no Stripe: reative em Desenvolvedores → Webhooks.` };
  } else {
    parts.push(`Webhook ${report.webhook.status === "ok" ? "conferido" : "com eventos adicionados"}.`);
  }
  return { ok: parts.join(" ") };
}

export default async function PlansPage() {
  const me = await requireBackoffice();
  const [plans, counts] = await Promise.all([
    db.platformPlan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.workspace.groupBy({ by: ["planTier"], _count: { _all: true } }),
  ]);
  const countOf = (code: string) => counts.find((c) => c.planTier === code)?._count._all ?? 0;
  const isAdmin = me.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de planos da Salutti. Cada plano pago cobra pelo preço do Stripe vinculado aqui, que precisa ter o mesmo valor e
          a mesma recorrência. Ao trocar o Stripe de teste para produção, sincronize de novo.
        </p>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">Stripe</CardTitle>
                <CardDescription>
                  Cria no Stripe os preços que faltam, liga cada plano pago ao seu preço, confere o webhook e configura o portal do
                  cliente (trocar de plano, cartão, faturas e cancelamento). Rode de novo depois de mudar um preço ou ao passar o
                  Stripe de teste para produção.
                </CardDescription>
              </div>
              {billingConfigured() ? (
                <Badge variant={stripeMode() === "produção" ? "success" : "warning"}>Modo {stripeMode()}</Badge>
              ) : (
                <Badge variant="muted">Sem chave</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ActionForm action={syncStripeAction} className="space-y-3">
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!billingConfigured()}>
                  Sincronizar com o Stripe
                </Button>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CardDescription>
                    {intervalLabel(p.interval)} · {formatPlanPrice(p)}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Inativo</Badge>}
                  {p.interval !== "trial" && !p.stripePriceId ? <Badge variant="warning">Sem preço no Stripe</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {countOf(p.code)} cliente{countOf(p.code) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isAdmin ? (
                <ActionForm action={updatePlanAction} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`name-${p.id}`}>Nome</Label>
                      <Input id={`name-${p.id}`} name="name" defaultValue={p.name} required maxLength={60} />
                    </div>
                    {p.interval === "trial" ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`trial-${p.id}`}>Dias de teste</Label>
                        <Input id={`trial-${p.id}`} name="trialDays" type="number" min={1} max={90} defaultValue={p.trialDays ?? 15} />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor={`price-${p.id}`}>Preço (R$/{p.interval === "anual" ? "ano" : "mês"})</Label>
                        <Input id={`price-${p.id}`} name="price" inputMode="decimal" defaultValue={centsToInput(p.priceCents)} required />
                      </div>
                    )}
                  </div>
                  {p.interval !== "trial" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`stripe-${p.id}`}>ID do preço no Stripe</Label>
                      <Input
                        id={`stripe-${p.id}`}
                        name="stripePriceId"
                        defaultValue={p.stripePriceId ?? ""}
                        placeholder="price_…"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor={`desc-${p.id}`}>Descrição</Label>
                    <Input id={`desc-${p.id}`} name="description" defaultValue={p.description ?? ""} maxLength={300} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4 accent-primary" />
                      Disponível para novos clientes
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      Salvar
                    </Button>
                  </div>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted-foreground">{p.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
