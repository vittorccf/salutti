import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { insightsEngine } from "@/lib/providers/insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFormat, getTranslations } from "@/i18n/server";
import { Brain, Sparkles, RefreshCw } from "lucide-react";
import { SALUTTIN_ENABLED } from "@/lib/features";

export const dynamic = "force-dynamic";

async function regenerateAction() {
  "use server";
  if (!SALUTTIN_ENABLED) notFound();
  const ctx = await requireContext();
  await insightsEngine.regenerate({ workspaceId: ctx.workspace.id });
  redirect("/app/saluttin");
}

export default async function SaluttinPage() {
  if (!SALUTTIN_ENABLED) notFound();
  const ctx = await requireContext();
  let insights = await db.aiInsight.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  if (insights.length === 0) {
    insights = await insightsEngine.regenerate({ workspaceId: ctx.workspace.id });
  }

  const t = await getTranslations("dashboard.saluttin");
  const f = await getFormat();
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  const grouped: Record<string, typeof insights> = {
    critical: insights.filter((i) => i.severity === "critical"),
    warn: insights.filter((i) => i.severity === "warn"),
    info: insights.filter((i) => i.severity === "info"),
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        <form action={regenerateAction}>
          <Button type="submit">
            <RefreshCw className="h-4 w-4" /> {t("recalculate")}
          </Button>
        </form>
      </header>

      <Card className="border-saluttin">
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <Brain className="h-5 w-5 shrink-0 text-brand mt-0.5" aria-hidden />
          <div>
            <p className="flex items-center gap-2 font-semibold">
              {t("watchTitle")}
              <span className="h-2 w-2 rounded-full bg-highlight" aria-hidden />
            </p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              <li>{t.rich("watchRevenue", { strong })}</li>
              <li>{t.rich("watchOverdue", { strong })}</li>
              <li>{t.rich("watchSchedule", { strong })}</li>
              <li>{t.rich("watchChurn", { strong })}</li>
              <li>{t.rich("watchRecords", { strong })}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {(["critical", "warn", "info"] as const).map((sev) => (
          <Card key={sev}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant={sev === "critical" ? "destructive" : sev === "warn" ? "warning" : "muted"}>
                  {t(`severity.${sev}`)}
                </Badge>
                {t("count", { count: grouped[sev].length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {grouped[sev].length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                grouped[sev].map((i) => (
                  <div key={i.id} className="rounded-md border bg-card p-4">
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{i.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.has(`kind.${i.kind}`) ? t(`kind.${i.kind}`) : i.kind} · {f.dateTime(i.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
