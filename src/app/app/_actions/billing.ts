"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { billing, billingConfigured, type PaidPlan } from "@/lib/providers/billing";

const baseUrl = () => {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
};

// Só quem é dono do consultório muda o plano.
const ownerContext = async () => {
  const ctx = await requireContext();
  if (ctx.role !== "owner") redirect("/app/ajustes?assinatura=sem-permissao");
  return ctx;
};

export async function subscribeAction(formData: FormData) {
  const ctx = await ownerContext();
  const plan = formData.get("plan");
  if (plan !== "starter" && plan !== "pro") redirect("/app/ajustes");

  if (!billingConfigured()) {
    // Sandbox: ativa o plano sem cobrança, registrado como simulação.
    await db.workspace.update({ where: { id: ctx.workspace.id }, data: { planTier: plan, trialEndsAt: null } });
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "billing.plan",
      entity: "Workspace",
      entityId: ctx.workspace.id,
      metadata: { planTier: plan, simulated: true },
    });
    redirect("/app/ajustes?assinatura=simulada");
  }

  let url: string;
  try {
    url = await billing.createCheckout({
      plan: plan as PaidPlan,
      workspace: ctx.workspace,
      email: ctx.user.email,
      baseUrl: baseUrl(),
    });
  } catch (e) {
    console.error("[billing] checkout", e);
    redirect("/app/ajustes?assinatura=erro");
  }
  redirect(url);
}

export async function billingPortalAction() {
  const ctx = await ownerContext();
  if (!billingConfigured()) redirect("/app/ajustes");
  let url: string;
  try {
    url = await billing.createPortal({ workspace: ctx.workspace, email: ctx.user.email, baseUrl: baseUrl() });
  } catch (e) {
    console.error("[billing] portal", e);
    redirect("/app/ajustes?assinatura=erro");
  }
  redirect(url);
}
