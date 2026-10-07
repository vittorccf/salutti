"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { billing, billingConfigured } from "@/lib/providers/billing";
import { accessExpired } from "@/lib/plan-access";

const baseUrl = () => {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
};

// Com o teste grátis vencido, Ajustes fica bloqueado: os avisos voltam para a tela de assinatura.
const returnPath = (ws: { planTier: string; trialEndsAt: Date | null }) => (accessExpired(ws) ? "/app/assinatura" : "/app/ajustes");

// Só quem é dono do consultório muda o plano (inclusive com o teste grátis vencido).
const ownerContext = async () => {
  const ctx = await requireContext({ allowExpired: true });
  if (ctx.role !== "owner") redirect(`${returnPath(ctx.workspace)}?assinatura=sem-permissao`);
  return { ctx, back: returnPath(ctx.workspace) };
};

export async function subscribeAction(formData: FormData) {
  const { ctx, back } = await ownerContext();
  const code = formData.get("plan");
  const plan =
    typeof code === "string"
      ? await db.platformPlan.findFirst({ where: { code, active: true, interval: { not: "trial" } } })
      : null;
  if (!plan) redirect(back);

  if (!billingConfigured()) {
    // Sandbox: ativa o plano sem cobrança, registrado como simulação.
    await db.workspace.update({ where: { id: ctx.workspace.id }, data: { planTier: plan.code, trialEndsAt: null } });
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "billing.plan",
      entity: "Workspace",
      entityId: ctx.workspace.id,
      metadata: { planTier: plan.code, simulated: true },
    });
    redirect("/app/ajustes?assinatura=simulada");
  }

  if (!plan.stripePriceId) {
    console.error(`[billing] plano ${plan.code} sem preço do Stripe no backoffice`);
    redirect(`${back}?assinatura=erro`);
  }
  let url: string;
  try {
    url = await billing.createCheckout({
      plan: { code: plan.code, stripePriceId: plan.stripePriceId },
      workspace: ctx.workspace,
      email: ctx.user.email,
      returnUrl: `${baseUrl()}${back}`,
    });
  } catch (e) {
    console.error("[billing] checkout", e);
    redirect(`${back}?assinatura=erro`);
  }
  redirect(url);
}

export async function billingPortalAction() {
  const { ctx, back } = await ownerContext();
  if (!billingConfigured()) redirect(back);
  let url: string;
  try {
    url = await billing.createPortal({ workspace: ctx.workspace, email: ctx.user.email, returnUrl: `${baseUrl()}${back}` });
  } catch (e) {
    console.error("[billing] portal", e);
    redirect(`${back}?assinatura=erro`);
  }
  redirect(url);
}
