// Assinatura SaaS da própria Salutti via Stripe Billing (API REST, sem SDK).
// Sem STRIPE_SECRET_KEY real, o app fica em sandbox: a ativação é simulada e marcada como tal.
//
// STRIPE_SECRET_KEY        sk_live_… / sk_test_…
// STRIPE_WEBHOOK_SECRET    whsec_… (endpoint /api/stripe/webhook)
// STRIPE_PRICE_STARTER     price_… (R$ 49/mês)
// STRIPE_PRICE_PRO         price_… (R$ 129/mês)
import crypto from "node:crypto";

export type PaidPlan = "starter" | "pro";

export const PLANS: Record<PaidPlan, { name: string; price: string; description: string }> = {
  starter: { name: "Starter", price: "R$ 49/mês", description: "Solo · até 50 pacientes ativos" },
  pro: { name: "Pro", price: "R$ 129/mês", description: "Solo + IA preditiva ilimitada" },
};

export const billingConfigured = () => {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_") && !key.includes("mock");
};

const priceFor = (plan: PaidPlan) =>
  plan === "starter" ? process.env.STRIPE_PRICE_STARTER : process.env.STRIPE_PRICE_PRO;

export const planForPrice = (priceId: string | undefined): PaidPlan | null =>
  priceId && priceId === process.env.STRIPE_PRICE_STARTER
    ? "starter"
    : priceId && priceId === process.env.STRIPE_PRICE_PRO
      ? "pro"
      : null;

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

export const billing = {
  async createCheckout(opts: {
    plan: PaidPlan;
    workspace: { id: string; name: string };
    email: string;
    baseUrl: string;
  }) {
    const price = priceFor(opts.plan);
    if (!price) throw new Error(`Preço do plano ${opts.plan} não configurado`);
    const customer = await customerFor(opts.workspace, opts.email);
    const metadata = { workspaceId: opts.workspace.id, plan: opts.plan };
    const session = await stripe<{ url: string }>("POST", "checkout/sessions", {
      mode: "subscription",
      customer,
      line_items: { 0: { price, quantity: 1 } },
      success_url: `${opts.baseUrl}/app/ajustes?assinatura=ok`,
      cancel_url: `${opts.baseUrl}/app/ajustes`,
      locale: "pt-BR",
      metadata,
      subscription_data: { metadata },
    });
    return session.url;
  },

  async createPortal(opts: { workspace: { id: string; name: string }; email: string; baseUrl: string }) {
    const customer = await customerFor(opts.workspace, opts.email);
    const portal = await stripe<{ url: string }>("POST", "billing_portal/sessions", {
      customer,
      return_url: `${opts.baseUrl}/app/ajustes`,
    });
    return portal.url;
  },
};

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
