import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ClipboardList, FilePlus2 } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";
import { noteTypeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProntuarioListPage() {
  const ctx = await requireContext();
  const notes = await db.clinicalNote.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { patient: true, professional: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary-strong" aria-hidden /> Prontuário
          </h1>
          <p className="text-sm text-muted-foreground">
            Evoluções e anamneses dos seus pacientes. A LUMA resume cada evolução ao salvar.
          </p>
        </div>
      </header>

      {notes.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Nenhuma evolução registrada"
          description="Abra a ficha de um paciente para registrar a primeira evolução."
          action={
            <Button asChild>
              <Link href="/app/pacientes">
                <FilePlus2 className="h-4 w-4" /> Selecionar paciente
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Paciente</TH>
                  <TH>Profissional</TH>
                  <TH>Tipo</TH>
                  <TH>Atualizado</TH>
                  <TH>LUMA</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {notes.map((n) => (
                  <TR key={n.id}>
                    <TD className="font-medium">{n.patient.fullName}</TD>
                    <TD>{n.professional.fullName}</TD>
                    <TD>{noteTypeLabel(n.noteType)}</TD>
                    <TD className="whitespace-nowrap">{formatDateTimeBR(n.updatedAt)}</TD>
                    <TD>
                      {n.aiSummary ? (
                        <Badge variant="success">Resumida</Badge>
                      ) : (
                        <Badge variant="muted">Pendente</Badge>
                      )}
                    </TD>
                    <TD>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/prontuario/${n.patient.id}`}>Abrir</Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
