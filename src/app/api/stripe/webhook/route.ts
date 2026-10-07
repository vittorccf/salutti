import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { verifyStripeSignature } from "@/lib/providers/billing";

// Webhook do Stripe: mantém Workspace.planTier igual à assinatura.
// Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted.
type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      metadata?: Record<string, string>;
      status?: string;
      payment_status?: string;
      items?: { data?: { price?: { id?: string } }[] };
    };
  };
};

const ACTIVE = new Set(["active", "trialing"]);
// Pagamento ainda não compensado (ex.: boleto): o plano só muda quando a assinatura ficar ativa.
const PAID = new Set(["paid", "no_payment_required"]);

// Plano pelo preço cobrado (fonte de verdade) ou, se o preço não estiver no catálogo, pelo metadata do checkout.
async function planFor(priceId: string | undefined, metadataPlan: string | undefined) {
  const byPrice = priceId ? await db.platformPlan.findUnique({ where: { stripePriceId: priceId }, select: { code: true } }) : null;
  if (byPrice) return byPrice.code;
  if (!metadataPlan || metadataPlan === "trial") return null;
  const byCode = await db.platformPlan.findUnique({ where: { code: metadataPlan }, select: { code: true } });
  return byCode?.code ?? null;
}

export const POST = async (req: Request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook não configurado" }, { status: 501 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;
  const obj = event.data.object;
  const workspaceId = obj.metadata?.workspaceId;
  if (!workspaceId) return NextResponse.json({ ignored: true });
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!workspace) return NextResponse.json({ ignored: true });

  let planTier: string | null = null;
  if (event.type === "checkout.session.completed") {
    if (obj.payment_status && PAID.has(obj.payment_status)) planTier = await planFor(undefined, obj.metadata?.plan);
  } else if (event.type === "customer.subscription.updated") {
    if (obj.status && ACTIVE.has(obj.status)) planTier = await planFor(obj.items?.data?.[0]?.price?.id, obj.metadata?.plan);
  } else if (event.type === "customer.subscription.deleted") {
    planTier = "trial";
  }
  if (!planTier) return NextResponse.json({ ignored: true });

  await db.workspace.update({
    where: { id: workspaceId },
    // Cancelada: volta para teste grátis já expirado (o app pede para assinar de novo).
    data: { planTier, trialEndsAt: planTier === "trial" ? new Date() : null },
  });
  await recordAudit({
    workspaceId,
    userId: null,
    action: "billing.plan",
    entity: "Workspace",
    entityId: workspaceId,
    metadata: { planTier, event: event.type, eventId: event.id },
  });
  return NextResponse.json({ ok: true });
};
