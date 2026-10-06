import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ShieldCheck, FileDown, Trash2, EyeOff } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";
import { consentPurposeLabel, legalBasisLabel } from "@/lib/lgpd";

export const dynamic = "force-dynamic";

const rights = [
  "Confirmação da existência de tratamento",
  "Acesso aos dados",
  "Correção de dados incompletos",
  "Anonimização, bloqueio ou eliminação",
  "Portabilidade",
  "Eliminação dos dados consentidos",
  "Informação sobre compartilhamento",
  "Informação sobre negativa de consentimento",
  "Revogação do consentimento",
];

async function exportDataAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.export",
    entity: "Patient",
    entityId: patientId,
  });
  redirect(`/api/lgpd/export?patientId=${patientId}`);
}

async function anonymizeAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  await db.patient.update({
    where: { id: patientId },
    data: {
      fullName: "ANONIMIZADO",
      email: null,
      phone: null,
      cpf: null,
      address: null,
      notes: null,
      anonymized: true,
      active: false,
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.anonymize",
    entity: "Patient",
    entityId: patientId,
  });
  redirect("/app/lgpd");
}

async function softDeleteAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  await db.patient.update({
    where: { id: patientId },
    data: { deletedAt: new Date(), active: false },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.delete",
    entity: "Patient",
    entityId: patientId,
  });
  redirect("/app/lgpd");
}

export default async function LgpdPage() {
  const ctx = await requireContext();
  const [auditLog, consents, patients] = await Promise.all([
    db.auditLog.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.consentRecord.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { grantedAt: "desc" },
      take: 30,
    }),
    db.patient.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary-strong" aria-hidden /> LGPD e conformidade
        </h1>
        <p className="text-sm text-muted-foreground">
          Você é o controlador dos dados e a Salutti é a operadora. Bases legais usadas: consentimento, tutela da
          saúde, execução de contrato e obrigação legal.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Os 9 direitos do titular (art. 18 da LGPD)</CardTitle>
          <CardDescription>Cada direito é atendido pelas ações abaixo, incluindo a exportação dos dados.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3 text-sm">
          {rights.map((r, idx) => (
            <div key={r} className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">Direito {idx + 1}</p>
              <p className="font-medium leading-tight">{r}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exercer direitos por paciente</CardTitle>
          <CardDescription>
            Exporte os dados em JSON, anonimize (mantém só dados agregados) ou elimine (respeitando o prazo legal de guarda).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end" action={exportDataAction}>
            <div className="space-y-1">
              <Label htmlFor="patientId">Paciente</Label>
              <Select name="patientId" id="patientId" required>
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <Button formAction={exportDataAction} type="submit" variant="outline">
              <FileDown className="h-4 w-4" /> Exportar dados
            </Button>
            <Button formAction={anonymizeAction} type="submit" variant="outline">
              <EyeOff className="h-4 w-4" /> Anonimizar
            </Button>
            <Button formAction={softDeleteAction} type="submit" variant="destructive">
              <Trash2 className="h-4 w-4" /> Eliminar dados
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Consentimentos recentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Paciente</TH>
                  <TH>Finalidade</TH>
                  <TH>Base legal</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {consents.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Nenhum consentimento registrado.
                    </TD>
                  </TR>
                ) : (
                  consents.map((c) => (
                    <TR key={c.id}>
                      <TD>{c.patient.fullName}</TD>
                      <TD>{consentPurposeLabel(c.purpose)}</TD>
                      <TD>{legalBasisLabel(c.legalBasis)}</TD>
                      <TD>
                        <Badge variant={c.granted && !c.revokedAt ? "success" : "muted"}>
                          {c.granted && !c.revokedAt ? "Concedido" : "Revogado"}
                        </Badge>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trilha de auditoria · últimos 30 eventos</CardTitle>
            <CardDescription>Registros imutáveis de quem fez o quê e quando.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Quando</TH>
                  <TH>Usuário</TH>
                  <TH>Ação</TH>
                  <TH>Entidade</TH>
                </TR>
              </THead>
              <TBody>
                {auditLog.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      Nenhum evento registrado.
                    </TD>
                  </TR>
                ) : (
                  auditLog.map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap text-xs">{formatDateTimeBR(l.createdAt)}</TD>
                      <TD className="text-xs">{l.user?.name ?? "Sistema"}</TD>
                      <TD className="font-mono text-xs">{l.action}</TD>
                      <TD className="font-mono text-xs">{l.entity}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
