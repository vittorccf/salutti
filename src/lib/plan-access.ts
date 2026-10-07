// Regras de acesso pelo plano do consultório (sem banco, para testar isoladamente).

// Teste grátis vencido: o consultório só acessa assinatura, dados (LGPD), conta e suporte até assinar.
export const accessExpired = (ws: { planTier: string; trialEndsAt: Date | null }, now = new Date()) =>
  ws.planTier === "trial" && ws.trialEndsAt !== null && ws.trialEndsAt <= now;

// Plano pago pelo Stripe (catálogo atual ou os antigos Starter/Pro): tem portal para gerenciar a assinatura.
export const hasPaidPlan = (planTier: string) => planTier !== "trial" && planTier !== "enterprise";
