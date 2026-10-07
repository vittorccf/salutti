import { getLocale, getTranslations } from "@/i18n/server";
import { db } from "@/lib/db";
import { supportMailto } from "@/lib/contact";
import { billingConfigured } from "@/lib/providers/billing";
import { hasPaidPlan } from "@/lib/plan-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { billingPortalAction, subscribeAction } from "../../_actions/billing";

// Planos pagos do catálogo (backoffice → Planos), com o botão de assinar ou o portal do Stripe.
export async function PlanOptions({ planTier, isOwner }: { planTier: string; isOwner: boolean }) {
  const t = await getTranslations("settings.page.plan");
  const brl = new Intl.NumberFormat(await getLocale(), { style: "currency", currency: "BRL" });
  const plans = await db.platformPlan.findMany({
    where: { active: true, interval: { not: "trial" } },
    orderBy: { sortOrder: "asc" },
  });
  const live = billingConfigured();
  const highlight = plans.find((p) => p.code === "essencial")?.code ?? plans[0]?.code;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const current = planTier === p.code;
          const price = brl.format(p.priceCents / 100);
          return (
            <div key={p.id} className={current ? "rounded-md border border-brand p-3" : "rounded-md border p-3"}>
              <p className="font-semibold">
                {p.name} · {p.interval === "anual" ? t("perYear", { price }) : t("perMonth", { price })}
              </p>
              {p.description ? <p className="text-muted-foreground">{p.description}</p> : null}
              {current ? (
                <Badge variant="success" className="mt-3">{t("currentBadge")}</Badge>
              ) : isOwner ? (
                <form action={subscribeAction} className="mt-3">
                  <input type="hidden" name="plan" value={p.code} />
                  <Button type="submit" size="sm" variant={p.code === highlight ? "default" : "outline"}>
                    {live ? t("subscribe", { plan: p.name }) : t("activateSimulated", { plan: p.name })}
                  </Button>
                </form>
              ) : null}
            </div>
          );
        })}
        <div className="rounded-md border p-3">
          <p className="font-semibold">{t("clinicTitle")}</p>
          <p className="text-muted-foreground">{t("clinicDescription")}</p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <a href={supportMailto("Plano Clínica")}>{t("contact")}</a>
          </Button>
        </div>
      </div>
      {isOwner && live && hasPaidPlan(planTier) ? (
        <form action={billingPortalAction}>
          <Button type="submit" variant="outline" size="sm">
            {t("manage")}
          </Button>
        </form>
      ) : null}
      {!isOwner ? <p className="text-muted-foreground">{t("ownerOnly")}</p> : null}
    </div>
  );
}
