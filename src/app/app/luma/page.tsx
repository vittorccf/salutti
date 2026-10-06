import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { insightsEngine } from "@/lib/providers/insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR, plural } from "@/lib/utils";
import { Brain, Sparkles, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

async function regenerateAction() {
  "use server";
  const ctx = await requireContext();
  await insightsEngine.regenerate({ workspaceId: ctx.workspace.id });
  redirect("/app/luma");
}

export default async function LumaPage() {
  const ctx = await requireContext();
  let insights = await db.aiInsight.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  if (insights.length === 0) {
    insights = await insightsEngine.regenerate({ workspaceId: ctx.workspace.id });
  }

  const grouped: Record<string, typeof insights> = {
    critical: insights.filter((i) => i.severity === "critical"),
    warn: insights.filter((i) => i.severity === "warn"),
    info: insights.filter((i) => i.severity === "info"),
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary-strong" aria-hidden /> LUMA · IA preditiva e clínica
          </h1>
          <p className="text-sm text-muted-foreground">
            A LUMA lê seus dados financeiros e clínicos e aponta o que pede atenção, com número e prazo.
          </p>
        </div>
        <form action={regenerateAction}>
          <Button type="submit">
            <RefreshCw className="h-4 w-4" /> Recalcular insights
          </Button>
        </form>
      </header>

      <Card>
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <Brain className="h-5 w-5 shrink-0 text-primary-strong mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold">O que a LUMA acompanha por você</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              <li><strong>Receita:</strong> compara o faturamento com o mês anterior e avisa quando cai.</li>
              <li><strong>Atrasos:</strong> soma as cobranças vencidas e sugere a régua de cobrança.</li>
              <li><strong>Agenda:</strong> aponta semanas com menos sessões que o esperado.</li>
              <li><strong>Continuidade:</strong> destaca pacientes há 60 dias ou mais sem sessão.</li>
              <li><strong>Prontuário:</strong> resume cada evolução ao salvar.</li>
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
                  {{ critical: "Crítico", warn: "Atenção", info: "Informativo" }[sev]}
                </Badge>
                {plural(grouped[sev].length, "insight", "insights")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {grouped[sev].length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada neste nível agora.</p>
              ) : (
                grouped[sev].map((i) => (
                  <div key={i.id} className="rounded-md border bg-card p-4">
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{i.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {insightKindLabel(i.kind)} · {formatDateTimeBR(i.createdAt)}
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

const insightKindLabel = (kind: string) =>
  ({
    revenue_drop: "Receita",
    overdue_pattern: "Atrasos",
    scheduling_gap: "Agenda",
    churn_risk: "Continuidade",
  })[kind] ?? kind;
