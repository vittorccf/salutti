import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ workspace: { findUnique: vi.fn(), update: vi.fn() } }));
const recordAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ recordAudit }));

import { billing, billingConfigured, verifyStripeSignature } from "@/lib/providers/billing";
import { POST as webhook } from "@/app/api/stripe/webhook/route";

const SECRET = "whsec_teste";
const sign = (payload: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

const ENV = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_PRO"];
beforeEach(() => {
  vi.resetAllMocks();
  db.workspace.findUnique.mockResolvedValue({ id: "ws1" });
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
    Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_test_123", STRIPE_PRICE_PRO: "price_pro" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "cus_1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/abc" })));
    vi.stubGlobal("fetch", fetchMock);

    const url = await billing.createCheckout({
      plan: "pro",
      workspace: { id: "ws1", name: "Consultório" },
      email: "a@b.dev",
      baseUrl: "https://app.salutti.dev",
    });
    expect(url).toBe("https://checkout.stripe.com/c/abc");
    expect(String(fetchMock.mock.calls[0][0])).toContain("customers/search");
    const body = new URLSearchParams(fetchMock.mock.calls[2][1].body);
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("customer")).toBe("cus_1");
    expect(body.get("line_items[0][price]")).toBe("price_pro");
    expect(body.get("subscription_data[metadata][workspaceId]")).toBe("ws1");
    expect(body.get("success_url")).toBe("https://app.salutti.dev/app/ajustes?assinatura=ok");
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

  it("checkout concluído ativa o plano e encerra o teste grátis", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const res = await call({
      id: "evt_ok",
      type: "checkout.session.completed",
      data: { object: { metadata: { workspaceId: "ws1", plan: "pro" } } },
    });
    expect(res.status).toBe(200);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { planTier: "pro", trialEndsAt: null } });
    expect(recordAudit).toHaveBeenCalled();
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
    await call({ id: "e", type: "checkout.session.completed", data: { object: { metadata: { workspaceId: "x", plan: "pro" } } } });
    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});
