import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { eligibleSessions, generateBatches, TissError } from "@/lib/tiss-service";
import { formatBRL, formatDateTimeBR, plural } from "@/lib/utils";
import { guideTypeLabel } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

async function generateAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const planId = String(formData.get("planId"));
  const ids = formData.getAll("appointmentId").map(String);
  let created: Awaited<ReturnType<typeof generateBatches>>;
  try {
    created = await generateBatches(ctx.workspace.id, planId, ids);
  } catch (e) {
    if (e instanceof TissError) redirect(`/app/convenios/${planId}?erro=${encodeURIComponent(e.message)}`);
    throw e;
  }
  for (const b of created) {
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "tiss.batch_create",
      entity: "TissBatch",
      entityId: b.id,
      metadata: { number: b.number, guides: b.guides, total: b.total },
    });
  }
  redirect(`/app/convenios/${planId}?gerado=${created.map((b) => b.number).join(",")}`);
}

export default async function InsurancePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; gerado?: string }>;
}) {
  const ctx = await requireContext();
  const { id } = await params;
  const { erro, gerado } = await searchParams;
  const plan = await db.insurancePlan.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!plan) notFound();

  const [sessions, batches] = await Promise.all([
    eligibleSessions(ctx.workspace.id, plan.id),
    db.tissBatch.findMany({
      where: { workspaceId: ctx.workspace.id, insurancePlanId: plan.id },
      orderBy: { number: "desc" },
      include: { _count: { select: { guides: true } } },
    }),
  ]);
  const ready = sessions.filter((s) => s.problems.length === 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Convênio · {plan.name}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          Registro ANS {plan.ansRegistry} · {formatBRL(plan.sessionPrice)} por sessão
          {plan.providerCode ? ` · código do prestador ${plan.providerCode}` : ""}
        </p>
      </header>

      {erro ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {erro}
        </p>
      ) : null}
      {gerado ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          Lote {gerado.split(",").join(", ")} gerado. Baixe o XML abaixo e envie pelo portal da operadora.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Sessões a faturar</CardTitle>
          <CardDescription>
            Sessões realizadas por este convênio que ainda não estão em um lote.{" "}
            {plural(ready.length, "pronta para faturar", "prontas para faturar")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nenhuma sessão a faturar. Quando uma sessão por este convênio for marcada como realizada, ela aparece aqui.
            </p>
          ) : (
            <form action={generateAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">
                      <span className="sr-only">Incluir</span>
                    </TH>
                    <TH>Data</TH>
                    <TH>Paciente</TH>
                    <TH>Profissional</TH>
                    <TH>Guia</TH>
                    <TH className="text-right">Valor</TH>
                  </TR>
                </THead>
                <TBody>
                  {sessions.map((s) => {
                    const ok = s.problems.length === 0;
                    return (
                      <TR key={s.id}>
                        <TD>
                          <input
                            type="checkbox"
                            name="appointmentId"
                            value={s.id}
                            defaultChecked={ok}
                            disabled={!ok}
                            aria-label={`Incluir sessão de ${s.patientName}`}
                            className="h-4 w-4 accent-primary"
                          />
                        </TD>
                        <TD className="whitespace-nowrap">{formatDateTimeBR(s.startsAt)}</TD>
                        <TD>
                          <span className="font-medium">{s.patientName}</span>
                          {!ok ? (
                            <ul className="mt-1 space-y-0.5 text-xs text-destructive-strong">
                              {s.problems.map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                            </ul>
                          ) : null}
                        </TD>
                        <TD>{s.professionalName}</TD>
                        <TD>{s.guideType ? guideTypeLabel(s.guideType) : "-"}</TD>
                        <TD className="text-right">{formatBRL(s.price)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <div className="p-4">
                <Button type="submit" disabled={ready.length === 0}>
                  Gerar lote TISS
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lotes gerados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum lote gerado ainda.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Lote</TH>
                  <TH>Gerado em</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Guias</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Hash</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium tabular-nums">{b.number}</TD>
                    <TD className="whitespace-nowrap">{formatDateTimeBR(b.createdAt)}</TD>
                    <TD>
                      <Badge variant="outline">{guideTypeLabel(b.guideType)}</Badge>
                    </TD>
                    <TD className="text-right">{b._count.guides}</TD>
                    <TD className="text-right">{formatBRL(b.totalAmount)}</TD>
                    <TD className="font-mono text-xs" title={b.hash}>
                      {b.hash.slice(0, 10)}…
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/api/tiss/lote/${b.id}`} download>
                          <Download className="h-4 w-4" /> XML
                        </a>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
