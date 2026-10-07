import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { eligibleSessions, generateBatches, TissError } from "@/lib/tiss-service";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Motivos de lib/tiss.ts (frases em pt-BR, usadas também nos testes do XML) viram chave de finance.tiss
// para aparecer no idioma da interface. Texto desconhecido aparece como veio.
const TISS_TEXT_KEY: Record<string, string> = {
  "Paciente sem número da carteirinha.": "noCard",
  "Paciente não está vinculado a este convênio.": "notLinked",
  "Profissional sem número do conselho.": "noCouncilNumber",
  "Profissional sem UF do conselho.": "noCouncilUF",
  "Convênios exigem registro em conselho (CRP ou CRM) de quem atende.": "councilRequired",
  "Odontologia usa a guia odontológica (GTO), ainda não disponível.": "dentalUnavailable",
  "Tipo de profissional sem guia TISS configurada.": "noGuideType",
  "Convênio não encontrado.": "planNotFound",
  "Informe o código do prestador na operadora ou o CNPJ do consultório.": "providerMissing",
  "Nenhuma sessão selecionada está pronta para faturar.": "noneReady",
};
// tiss-service já lança/registra a chave; só o motivo de lib/tiss.ts ainda chega como frase.
const TISS_KEYS = new Set(Object.values(TISS_TEXT_KEY));
const tissKey = (text: string) => (TISS_KEYS.has(text) ? text : Object.hasOwn(TISS_TEXT_KEY, text) ? TISS_TEXT_KEY[text] : null);

async function generateAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const planId = String(formData.get("planId"));
  const ids = formData.getAll("appointmentId").map(String);
  let created: Awaited<ReturnType<typeof generateBatches>>;
  try {
    created = await generateBatches(ctx.workspace.id, planId, ids);
  } catch (e) {
    if (e instanceof TissError) redirect(`/app/convenios/${planId}?erro=${tissKey(e.message) ?? "generic"}`);
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
  const t = await getTranslations("finance.plan");
  const tt = await getTranslations("finance.tiss");
  const tc = await getTranslations("common");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const tissText = (text: string) => {
    const key = tissKey(text);
    return key ? tt(key) : text;
  };
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
        <h1 className="text-page-title">{t("title", { name: plan.name })}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("subtitle", { ans: plan.ansRegistry, price: f.money(plan.sessionPrice) })}
          {plan.providerCode ? t("providerCode", { code: plan.providerCode }) : ""}
        </p>
      </header>

      {erro ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {tt.has(erro) ? tt(erro) : tc("errors.generic")}
        </p>
      ) : null}
      {gerado ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("generated", { numbers: gerado.split(",").join(", ") })}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("toBillTitle")}</CardTitle>
          <CardDescription>
            {t("toBillDescription")} {t("ready", { count: ready.length })}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <form action={generateAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">
                      <span className="sr-only">{t("include")}</span>
                    </TH>
                    <TH>{t("date")}</TH>
                    <TH>{t("patient")}</TH>
                    <TH>{t("professional")}</TH>
                    <TH>{t("guide")}</TH>
                    <TH className="text-right">{t("amount")}</TH>
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
                            aria-label={t("includeSession", { patient: s.patientName })}
                            className="h-4 w-4 accent-primary"
                          />
                        </TD>
                        <TD className="whitespace-nowrap">{f.dateTime(s.startsAt)}</TD>
                        <TD>
                          <span className="font-medium">{s.patientName}</span>
                          {!ok ? (
                            <ul className="mt-1 space-y-0.5 text-xs text-destructive-strong">
                              {s.problems.map((p) => (
                                <li key={p}>{tissText(p)}</li>
                              ))}
                            </ul>
                          ) : null}
                        </TD>
                        <TD>{s.professionalName}</TD>
                        <TD>{label("guideType", s.guideType)}</TD>
                        <TD className="text-right">{f.money(s.price)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <div className="p-4">
                <Button type="submit" disabled={ready.length === 0}>
                  {t("generate")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("batches")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState title={t("noBatches")} className="p-6" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("batch")}</TH>
                  <TH>{t("createdAt")}</TH>
                  <TH>{t("type")}</TH>
                  <TH className="text-right">{t("guides")}</TH>
                  <TH className="text-right">{t("total")}</TH>
                  <TH>{t("hash")}</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium tabular-nums">{b.number}</TD>
                    <TD className="whitespace-nowrap">{f.dateTime(b.createdAt)}</TD>
                    <TD>
                      <Badge variant="outline">{label("guideType", b.guideType)}</Badge>
                    </TD>
                    <TD className="text-right">{b._count.guides}</TD>
                    <TD className="text-right">{f.money(b.totalAmount)}</TD>
                    <TD className="font-mono text-xs" title={b.hash}>
                      {b.hash.slice(0, 10)}…
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/api/tiss/lote/${b.id}`} download>
                          <Download className="h-4 w-4" /> {t("xml")}
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
