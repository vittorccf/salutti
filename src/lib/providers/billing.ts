// Assinatura SaaS da própria Salutti via Stripe Billing (API REST, sem SDK).
// Sem STRIPE_SECRET_KEY real, o app fica em sandbox: a ativação é simulada e marcada como tal.
// Os planos e preços vêm do catálogo do backoffice (PlatformPlan); cada plano pago aponta para um price_… do Stripe.
//
// STRIPE_SECRET_KEY        sk_live_… / sk_test_…
// STRIPE_WEBHOOK_SECRET    whsec_… (endpoint /api/stripe/webhook)
import crypto from "node:crypto";

export const billingConfigured = () => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_") && !key.includes("mock");
};

// A API do Stripe recebe form-urlencoded com chaves aninhadas: a[b][0][c]=v.
const encode = (obj: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === "object") return encode(v as Record<string, unknown>, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });

async function stripe<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}): Promise<T> {
  const body = encode(params).join("&");
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status} ${json.error?.message ?? ""}`.trim());
  return json;
}

// Cliente do Stripe do consultório (procurado pelo metadata, criado se não existir).
async function customerFor(workspace: { id: string; name: string }, email: string) {
  const found = await stripe<{ data: { id: string }[] }>("GET", "customers/search", {
    query: `metadata['workspaceId']:'${workspace.id}'`,
  });
  if (found.data[0]) return found.data[0].id;
  const created = await stripe<{ id: string }>("POST", "customers", {
    email,
    name: workspace.name,
    metadata: { workspaceId: workspace.id },
  });
  return created.id;
}

type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
};

const INTERVALS: Record<string, string> = { mensal: "month", anual: "year" };

export const billing = {
  async createCheckout(opts: {
    plan: { code: string; stripePriceId: string };
    workspace: { id: string; name: string };
    email: string;
    returnUrl: string;
  }) {
    const customer = await customerFor(opts.workspace, opts.email);
    const metadata = { workspaceId: opts.workspace.id, plan: opts.plan.code };
    const session = await stripe<{ url: string }>("POST", "checkout/sessions", {
      mode: "subscription",
      customer,
      line_items: { 0: { price: opts.plan.stripePriceId, quantity: 1 } },
      success_url: `${opts.returnUrl}?assinatura=ok`,
      cancel_url: opts.returnUrl,
      locale: "pt-BR",
      metadata,
      subscription_data: { metadata },
    });
    return session.url;
  },

  async createPortal(opts: { workspace: { id: string; name: string }; email: string; returnUrl: string }) {
    const customer = await customerFor(opts.workspace, opts.email);
    const portal = await stripe<{ url: string }>("POST", "billing_portal/sessions", {
      customer,
      return_url: opts.returnUrl,
    });
    return portal.url;
  },

  // Confere se o preço do Stripe cobra o mesmo que o catálogo mostra; devolve o motivo da divergência ou null.
  async checkPrice(priceId: string, plan: { priceCents: number; interval: string }): Promise<string | null> {
    let price: StripePrice;
    try {
      price = await stripe<StripePrice>("GET", `prices/${encodeURIComponent(priceId)}`);
    } catch {
      return "Preço não encontrado no Stripe. Confira o ID e se a chave é do mesmo modo (teste ou produção).";
    }
    return priceMismatch(price, plan);
  },
};

export function priceMismatch(price: StripePrice, plan: { priceCents: number; interval: string }): string | null {
  if (!price.active) return "Esse preço está arquivado no Stripe.";
  if (!price.recurring) return "Esse preço não é recorrente. Crie um preço de assinatura no Stripe.";
  if (price.currency !== "brl") return "Esse preço não está em reais (BRL).";
  if (price.recurring.interval !== INTERVALS[plan.interval] || price.recurring.interval_count !== 1) {
    return `A recorrência no Stripe não bate com o plano (${plan.interval}).`;
  }
  if (price.unit_amount !== plan.priceCents) {
    const brl = (cents: number | null) => ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return `O Stripe cobra ${brl(price.unit_amount)} e o plano mostra ${brl(plan.priceCents)}. Crie um preço novo no Stripe ou ajuste o valor.`;
  }
  return null;
}

// Verifica o cabeçalho Stripe-Signature (t=…,v1=…) com HMAC-SHA256 e tolerância de 5 minutos.
export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Date.now() / 1000) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")];
    }),
  ) as Record<string, string>;
  const signatures = header
    .split(",")
    .filter((p) => p.trim().startsWith("v1="))
    .map((p) => p.trim().slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSeconds - t) > 300 || signatures.length === 0) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return signatures.some(
    (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)),
  );
}
