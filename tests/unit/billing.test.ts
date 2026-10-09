import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn(), update: vi.fn() },
  platformPlan: { findUnique: vi.fn() },
}));
const recordAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db, assertNotSupportSession: async () => {} }));
vi.mock("@/lib/audit", () => ({ recordAudit }));

import {
  billing,
  billingConfigured,
  lookupKeyFor,
  missingEvents,
  priceMismatch,
  stripeMode,
  syncStripe,
  verifyStripeSignature,
  WEBHOOK_EVENTS,
} from "@/lib/providers/billing";
import { accessExpired } from "@/lib/plan-access";
import { POST as webhook } from "@/app/api/stripe/webhook/route";

const SECRET = "whsec_teste";
const sign = (payload: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

const ENV = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];
// Catálogo: basico (price_basico) e anual (price_anual).
const CATALOG = [
  { code: "basico", stripePriceId: "price_basico" },
  { code: "anual", stripePriceId: "price_anual" },
];
beforeEach(() => {
  vi.resetAllMocks();
  db.workspace.findUnique.mockResolvedValue({ id: "ws1" });
  db.platformPlan.findUnique.mockImplementation(async ({ where }: { where: { code?: string; stripePriceId?: string } }) =>
    CATALOG.find((p) => (where.code ? p.code === where.code : p.stripePriceId === where.stripePriceId)) ?? null,
  );
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("assinatura do webhook", () => {
  const payload = JSON.stringify({ id: "evt_1" });
  it("aceita a assinatura correta e recusa adulteração, segredo errado e evento antigo", () => {
    expect(verifyStripeSignature(payload, sign(payload), SECRET)).toBe(true);
    expect(verifyStripeSignature(payload + " ", sign(payload), SECRET)).toBe(false);
    expect(verifyStripeSignature(payload, sign(payload, undefined, "outro"), SECRET)).toBe(false);
    expect(verifyStripeSignature(payload, sign(payload, Math.floor(Date.now() / 1000) - 600), SECRET)).toBe(false);
    expect(verifyStripeSignature(payload, null, SECRET)).toBe(false);
  });
});

describe("checkout", () => {
  it("sandbox sem chave real", () => {
    process.env.STRIPE_SECRET_KEY = "sk_mock_stripe";
    expect(billingConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(billingConfigured()).toBe(true);
  });

  it("cria cliente com o workspace no metadata e sessão de assinatura", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "cus_1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/abc" })));
    vi.stubGlobal("fetch", fetchMock);

    const url = await billing.createCheckout({
      plan: { code: "basico", stripePriceId: "price_basico" },
      workspace: { id: "ws1", name: "Consultório" },
      email: "a@b.dev",
      returnUrl: "https://app.salutti.dev/app/ajustes",
    });
    expect(url).toBe("https://checkout.stripe.com/c/abc");
    expect(String(fetchMock.mock.calls[0][0])).toContain("customers/search");
    const body = new URLSearchParams(fetchMock.mock.calls[2][1].body);
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("customer")).toBe("cus_1");
    expect(body.get("line_items[0][price]")).toBe("price_basico");
    expect(body.get("subscription_data[metadata][workspaceId]")).toBe("ws1");
    expect(body.get("subscription_data[metadata][plan]")).toBe("basico");
    expect(body.get("success_url")).toBe("https://app.salutti.dev/app/ajustes?assinatura=ok");
  });
});

describe("conferência do preço do Stripe com o catálogo", () => {
  const price = { id: "price_1", active: true, currency: "brl", unit_amount: 4990, recurring: { interval: "month", interval_count: 1 } };
  const plan = { priceCents: 4990, interval: "mensal" };
  it("aceita o mesmo valor, moeda e recorrência", () => {
    expect(priceMismatch(price, plan)).toBeNull();
    expect(
      priceMismatch({ ...price, unit_amount: 74990, recurring: { interval: "year", interval_count: 1 } }, { priceCents: 74990, interval: "anual" }),
    ).toBeNull();
  });
  it("recusa valor, moeda, recorrência diferentes, preço avulso e arquivado", () => {
    expect(priceMismatch({ ...price, unit_amount: 4900 }, plan)).toMatch(/49,00/);
    expect(priceMismatch({ ...price, currency: "usd" }, plan)).toMatch(/BRL/);
    expect(priceMismatch({ ...price, recurring: { interval: "year", interval_count: 1 } }, plan)).toMatch(/recorrência/);
    expect(priceMismatch({ ...price, recurring: { interval: "month", interval_count: 3 } }, plan)).toMatch(/recorrência/);
    expect(priceMismatch({ ...price, recurring: null }, plan)).toMatch(/recorrente/);
    expect(priceMismatch({ ...price, active: false }, plan)).toMatch(/arquivado/);
  });
});

describe("acesso pelo plano", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("bloqueia só o teste grátis vencido", () => {
    expect(accessExpired({ planTier: "trial", trialEndsAt: new Date("2026-10-08T11:59:00Z") }, now)).toBe(true);
    expect(accessExpired({ planTier: "trial", trialEndsAt: new Date("2026-10-09T00:00:00Z") }, now)).toBe(false);
    expect(accessExpired({ planTier: "trial", trialEndsAt: null }, now)).toBe(false);
    expect(accessExpired({ planTier: "basico", trialEndsAt: new Date("2026-01-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("webhook", () => {
  const call = (event: object, secret = SECRET) => {
    const payload = JSON.stringify(event);
    return webhook(
      new Request("http://x/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": sign(payload, undefined, secret) },
      }),
    );
  };

  it("sem segredo configurado responde 501", async () => {
    const res = await call({});
    expect(res.status).toBe(501);
  });

  it("assinatura inválida não altera nada", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await call({ id: "e", type: "checkout.session.completed", data: { object: {} } }, "outro");
    expect(res.status).toBe(400);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("checkout pago ativa o plano do catálogo e encerra o teste grátis", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await call({
      id: "evt_ok",
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", metadata: { workspaceId: "ws1", plan: "basico" } } },
    });
    expect(res.status).toBe(200);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planTier: "basico", trialEndsAt: null } });
    expect(recordAudit).toHaveBeenCalled();
  });

  it("checkout com pagamento pendente (boleto) ou plano fora do catálogo não ativa nada", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const session = (payment_status: string, plan: string) => ({ object: { payment_status, metadata: { workspaceId: "ws1", plan } } });
    await call({ id: "e1", type: "checkout.session.completed", data: session("unpaid", "basico") });
    await call({ id: "e2", type: "checkout.session.completed", data: session("paid", "trial") });
    await call({ id: "e3", type: "checkout.session.completed", data: session("paid", "ouro") });
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("assinatura ativa segue o preço cobrado (troca de plano pelo portal)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await call({
      id: "evt_upd",
      type: "customer.subscription.updated",
      data: { object: { status: "active", metadata: { workspaceId: "ws1", plan: "basico" }, items: { data: [{ price: { id: "price_anual" } }] } } },
    });
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planTier: "anual", trialEndsAt: null } });
  });

  it("assinatura inadimplente não muda o plano", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await call({
      id: "evt_due",
      type: "customer.subscription.updated",
      data: { object: { status: "past_due", metadata: { workspaceId: "ws1" }, items: { data: [{ price: { id: "price_anual" } }] } } },
    });
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("assinatura cancelada volta para teste grátis expirado", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    await call({ id: "evt_del", type: "customer.subscription.deleted", data: { object: { metadata: { workspaceId: "ws1" } } } });
    const data = db.workspace.update.mock.calls[0][0].data;
    expect(data.planTier).toBe("trial");
    expect(data.trialEndsAt).toBeInstanceOf(Date);
  });

  it("evento de outro workspace inexistente é ignorado", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    db.workspace.findUnique.mockResolvedValue(null);
    await call({ id: "e", type: "checkout.session.completed", data: { object: { payment_status: "paid", metadata: { workspaceId: "x", plan: "basico" } } } });
    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});

describe("sincronização com o Stripe", () => {
  const PLANS = [
    { code: "trial", name: "Teste grátis", priceCents: 0, interval: "trial", stripePriceId: null, active: true },
    { code: "basico", name: "Básico", priceCents: 4990, interval: "mensal", stripePriceId: "price_ok", active: true },
    { code: "anual", name: "Anual", priceCents: 74990, interval: "anual", stripePriceId: null, active: true },
    { code: "velho", name: "Velho", priceCents: 1990, interval: "mensal", stripePriceId: null, active: false },
  ];
  const recurring = (interval: string) => ({ interval, interval_count: 1 });
  const PRICES: Record<string, object> = {
    price_ok: { id: "price_ok", product: "prod_basico", active: true, currency: "brl", unit_amount: 4990, recurring: recurring("month") },
    price_novo_anual: { id: "price_novo_anual", product: "prod_anual", active: true, currency: "brl", unit_amount: 74990, recurring: recurring("year") },
    price_novo_velho: { id: "price_novo_velho", product: "prod_velho", active: true, currency: "brl", unit_amount: 1990, recurring: recurring("month") },
  };

  // API do Stripe falsa, por rota; `endpoints` é a lista de webhooks já cadastrados.
  const fakeStripe = (endpoints: object[], portals: object[] = []) => {
    const calls: { method: string; path: string; body: URLSearchParams }[] = [];
    const json = (v: unknown) => new Response(JSON.stringify(v));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit) => {
        const url = new URL(input);
        const path = url.pathname.replace("/v1/", "");
        const method = init.method ?? "GET";
        const body = new URLSearchParams(method === "POST" ? String(init.body) : url.search);
        calls.push({ method, path, body });
        if (method === "GET" && path.startsWith("prices/")) return json(PRICES[path.slice(7)] ?? {});
        if (method === "GET" && path === "prices") return json({ data: [] });
        if (path === "products/search") return json({ data: [] });
        if (method === "POST" && path === "products") return json({ id: `prod_${body.get("metadata[planCode]")}` });
        if (method === "POST" && path === "prices") return json({ id: `price_novo_${body.get("metadata[planCode]")}` });
        if (method === "GET" && path === "webhook_endpoints") return json({ data: endpoints });
        if (method === "POST" && path === "webhook_endpoints") return json({ id: "we_1", secret: "whsec_novo" });
        if (method === "GET" && path === "billing_portal/configurations") return json({ data: portals });
        return json({ id: "ok" });
      }),
    );
    return calls;
  };

  it("chaves e eventos", () => {
    expect(lookupKeyFor({ code: "anual", priceCents: 74990, interval: "anual" })).toBe("salutti_anual_74990_year");
    expect(missingEvents(["*"])).toEqual([]);
    expect(missingEvents(["checkout.session.completed"])).toEqual(WEBHOOK_EVENTS.slice(1));
    process.env.STRIPE_SECRET_KEY = "sk_live_1";
    expect(stripeMode()).toBe("produção");
    process.env.STRIPE_SECRET_KEY = "sk_test_1";
    expect(stripeMode()).toBe("teste");
  });

  it("reaproveita o preço que bate, cria os que faltam, cria o webhook e o portal só com planos ativos", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_1";
    const calls = fakeStripe([]);
    const report = await syncStripe(PLANS, "https://salutti.vercel.app");

    expect(report.mode).toBe("teste");
    expect(report.prices.map((p) => [p.code, p.priceId, p.created])).toEqual([
      ["basico", "price_ok", false],
      ["anual", "price_novo_anual", true],
      ["velho", "price_novo_velho", true],
    ]);
    const anual = calls.find((c) => c.method === "POST" && c.path === "prices" && c.body.get("metadata[planCode]") === "anual")!;
    expect(anual.body.get("currency")).toBe("brl");
    expect(anual.body.get("unit_amount")).toBe("74990");
    expect(anual.body.get("recurring[interval]")).toBe("year");
    expect(anual.body.get("lookup_key")).toBe("salutti_anual_74990_year");

    expect(report.webhook).toEqual({ url: "https://salutti.vercel.app/api/stripe/webhook", status: "criado", secret: "whsec_novo" });
    const hook = calls.find((c) => c.method === "POST" && c.path === "webhook_endpoints")!;
    expect([0, 1, 2].map((i) => hook.body.get(`enabled_events[${i}]`))).toEqual(WEBHOOK_EVENTS);

    expect(report.portal).toBe("criado");
    const portal = calls.find((c) => c.method === "POST" && c.path === "billing_portal/configurations")!;
    expect(portal.body.get("features[subscription_cancel][mode]")).toBe("at_period_end");
    expect(portal.body.get("features[subscription_update][products][0][prices][0]")).toBe("price_ok");
    expect(portal.body.get("features[subscription_update][products][1][prices][0]")).toBe("price_novo_anual");
    expect(portal.body.get("features[subscription_update][products][2][product]")).toBeNull();
    expect(portal.body.get("default_return_url")).toBe("https://salutti.vercel.app/app/assinatura");
  });

  it("webhook existente: só acrescenta os eventos que faltam e atualiza o portal padrão", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_1";
    const calls = fakeStripe(
      [{ id: "we_9", url: "https://salutti.vercel.app/api/stripe/webhook", enabled_events: ["checkout.session.completed"], status: "enabled" }],
      [{ id: "bpc_1" }],
    );
    const report = await syncStripe(PLANS.slice(0, 2), "https://salutti.vercel.app");
    expect(report.webhook).toEqual({ url: "https://salutti.vercel.app/api/stripe/webhook", status: "eventos adicionados" });
    const update = calls.find((c) => c.method === "POST" && c.path === "webhook_endpoints/we_9")!;
    expect([0, 1, 2].map((i) => update.body.get(`enabled_events[${i}]`))).toEqual(WEBHOOK_EVENTS);
    expect(calls.some((c) => c.method === "POST" && c.path === "webhook_endpoints")).toBe(false);
    expect(report.portal).toBe("atualizado");
    expect(calls.some((c) => c.method === "POST" && c.path === "billing_portal/configurations/bpc_1")).toBe(true);
  });
});
