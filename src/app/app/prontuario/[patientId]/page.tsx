import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";
import { FilePlus2, FileSignature, Sparkles, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProntuarioPatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const ctx = await requireContext();
  const { patientId } = await params;
  const patient = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null },
    include: {
      clinicalNotes: {
        include: { professional: true, appointment: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!patient) notFound();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Prontuário · {patient.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {patient.clinicalNotes.length} entrada(s). Sumarização IA disponível para cada evolução.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/app/prontuario/${patient.id}/anamnese`}>
              <FileSignature className="h-4 w-4" /> Aplicar anamnese
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/prontuario/${patient.id}/nova-evolucao`}>
              <FilePlus2 className="h-4 w-4" /> Nova evolução
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        {patient.clinicalNotes.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-semibold">Sem evoluções registradas.</p>
              <p className="text-sm text-muted-foreground">
                Crie a primeira evolução para gerar sumário automático com o LUMA.
              </p>
            </CardContent>
          </Card>
        ) : (
          patient.clinicalNotes.map((n) => (
            <Card key={n.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base capitalize">
                    {n.noteType.replace("_", " ")}{" "}
                    {n.signedAt ? <Badge variant="success" className="ml-2">Assinado</Badge> : null}
                  </CardTitle>
                  <CardDescription>
                    {n.professional.fullName} · {formatDateTimeBR(n.createdAt)}
                  </CardDescription>
                </div>
                {n.appointment ? (
                  <Badge variant="muted">Sessão {formatDateTimeBR(n.appointment.startsAt)}</Badge>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {n.contentMarkdown}
                </article>
                {n.aiSummary ? (
                  <div className="rounded-md border bg-accent/20 p-3 text-sm">
                    <p className="font-semibold flex items-center gap-2 text-primary">
                      <Sparkles className="h-4 w-4" /> Sumário LUMA
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{n.aiSummary}</pre>
                    {n.aiTopics ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {n.aiTopics.split(",").filter(Boolean).map((t) => (
                          <Badge key={t} variant="muted">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="rounded-md border-dashed border bg-muted/30 p-3 text-xs flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    Em produção: conteúdo cifrado em repouso + assinatura ICP-Brasil (A1 em nuvem · Memed/SafeID).
                    Hash atual: <code>{n.signedHash ?? "-"}</code>
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
