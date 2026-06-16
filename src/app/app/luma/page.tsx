import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { insightsEngine } from "@/lib/providers/insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";
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
            <Sparkles className="h-6 w-6 text-primary" /> LUMA - IA preditiva &amp; clínica
          </h1>
          <p className="text-sm text-muted-foreground">
            Núcleo de inteligência da Salutti. Calcula insights determinísticos dos seus dados; opera com OpenAI quando
            <code>OPENAI_API_KEY</code> está configurada (fallback heurístico em modo demo).
          </p>
        </div>
        <form action={regenerateAction}>
          <Button type="submit">
            <RefreshCw className="h-4 w-4" /> Recalcular insights
          </Button>
        </form>
      </header>

      <Card className="bg-accent/30 border-primary/20">
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <Brain className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold">O que o LUMA observa por você</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              <li><strong>Receita preditiva:</strong> compara faturamento mensal e dispara alerta de queda.</li>
              <li><strong>Inadimplência:</strong> mede atrasos e sugere régua de cobrança.</li>
              <li><strong>Ocupação de agenda:</strong> identifica semanas com menos sessões que o esperado.</li>
              <li><strong>Churn clínico:</strong> destaca pacientes ≥60 dias sem sessão.</li>
              <li><strong>Sumarização de prontuário:</strong> condensa cada evolução em segundos (campos LUMA na ficha).</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {(["critical", "warn", "info"] as const).map((sev) => (
          <Card key={sev}>
            <CardHeader>
              <CardTitle className="capitalize text-base flex items-center gap-2">
                <Badge variant={sev === "critical" ? "destructive" : sev === "warn" ? "warning" : "muted"}>
                  {sev}
                </Badge>
                {grouped[sev].length} insight(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {grouped[sev].length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada nesta severidade no momento.</p>
              ) : (
                grouped[sev].map((i) => (
                  <div key={i.id} className="rounded-md border bg-card p-4">
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{i.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {i.kind} · {formatDateTimeBR(i.createdAt)}
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
