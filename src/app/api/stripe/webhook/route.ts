import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { planForPrice, verifyStripeSignature } from "@/lib/providers/billing";

// Webhook do Stripe: mantém Workspace.planTier igual à assinatura.
// Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted.
type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      metadata?: Record<string, string>;
      status?: string;
      items?: { data?: { price?: { id?: string } }[] };
    };
  };
};

const ACTIVE = new Set(["active", "trialing"]);

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
    planTier = obj.metadata?.plan === "starter" || obj.metadata?.plan === "pro" ? obj.metadata.plan : null;
  } else if (event.type === "customer.subscription.updated") {
    const plan = planForPrice(obj.items?.data?.[0]?.price?.id) ?? (obj.metadata?.plan as string | undefined) ?? null;
    if (obj.status && ACTIVE.has(obj.status) && plan) planTier = plan;
  } else if (event.type === "customer.subscription.deleted") {
    planTier = "trial";
  }
  if (!planTier) return NextResponse.json({ ignored: true });

  await db.workspace.update({
    where: { id: workspaceId },
    // Cancelada: volta para teste grátis já expirado.
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
