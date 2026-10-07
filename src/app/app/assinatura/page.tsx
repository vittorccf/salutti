import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { accessExpired } from "@/lib/plan-access";
import { getTranslations } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanOptions } from "../_components/billing/plan-options";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, "ok" | "erro"> = { ok: "ok", erro: "erro", "sem-permissao": "erro" };

// Para onde o app leva quem está com o teste grátis vencido (ou com a assinatura cancelada).
export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ assinatura?: string }> }) {
  const ctx = await requireContext({ allowExpired: true });
  const { assinatura } = await searchParams;
  if (!accessExpired(ctx.workspace)) redirect(assinatura === "ok" ? "/app/ajustes?assinatura=ok" : "/app");

  const t = await getTranslations("settings.subscription");
  const tNotice = await getTranslations("settings.page.notices.subscription");
  const aviso = assinatura && Object.hasOwn(AVISOS, assinatura) ? { tone: AVISOS[assinatura], text: tNotice(assinatura) } : null;
  const isOwner = ctx.role === "owner";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      {aviso ? (
        <p
          role={aviso.tone === "erro" ? "alert" : "status"}
          className={
            aviso.tone === "erro"
              ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
              : "rounded-md bg-success/10 p-3 text-sm text-success-strong"
          }
        >
          {aviso.tone === "ok" ? t("pending") : aviso.text}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("plansTitle")}</CardTitle>
          <CardDescription>{isOwner ? t("plansOwner") : t("plansMember")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PlanOptions planTier={ctx.workspace.planTier} isOwner={isOwner} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dataTitle")}</CardTitle>
          <CardDescription>{t("dataDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/lgpd">{t("dataLink")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
