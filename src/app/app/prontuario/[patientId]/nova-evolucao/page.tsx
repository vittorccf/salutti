import { notFound, redirect } from "next/navigation";
import crypto from "node:crypto";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { luma } from "@/lib/providers/llm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  professionalId: z.string(),
  appointmentId: z.string().optional(),
  noteType: z.enum(["anamnese", "evolucao", "plano_terapeutico", "alta"]),
  contentMarkdown: z.string().min(20),
  sign: z.string().optional(),
});

async function saveNoteAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  const data = schema.parse({
    professionalId: formData.get("professionalId"),
    appointmentId: formData.get("appointmentId") || undefined,
    noteType: formData.get("noteType"),
    contentMarkdown: formData.get("contentMarkdown"),
    sign: formData.get("sign") || undefined,
  });

  const patient = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!patient) redirect("/app/pacientes");

  const aiOutput = await luma.summarizeSession({
    text: data.contentMarkdown,
    patientName: patient.fullName,
  });

  const signedHash =
    data.sign === "on"
      ? crypto.createHash("sha256").update(`${data.contentMarkdown}|${Date.now()}`).digest("hex")
      : null;

  const note = await db.clinicalNote.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId,
      professionalId: data.professionalId,
      appointmentId: data.appointmentId || null,
      noteType: data.noteType,
      contentMarkdown: data.contentMarkdown,
      aiSummary: aiOutput.summary,
      aiTopics: aiOutput.topics.join(","),
      signedAt: data.sign === "on" ? new Date() : null,
      signedHash,
    },
  });

  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "clinical_note.create",
    entity: "ClinicalNote",
    entityId: note.id,
    metadata: { signed: data.sign === "on" },
  });

  redirect(`/app/prontuario/${patientId}`);
}

export default async function NewClinicalNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ appointmentId?: string }>;
}) {
  const ctx = await requireContext();
  const { patientId } = await params;
  const { appointmentId } = await searchParams;
  const [patient, professionals] = await Promise.all([
    db.patient.findFirst({
      where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null },
    }),
    db.professional.findMany({
      where: { workspaceId: ctx.workspace.id, active: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  if (!patient) notFound();

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Nova evolução · {patient.fullName}</CardTitle>
          <CardDescription>
            O LUMA sumariza imediatamente. Assinatura ICP-Brasil simulada via hash SHA-256 do conteúdo + timestamp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveNoteAction} className="space-y-4">
            <input type="hidden" name="patientId" value={patient.id} />
            {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Profissional</Label>
                <Select name="professionalId" required>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de registro</Label>
                <Select name="noteType" defaultValue="evolucao">
                  <option value="evolucao">Evolução</option>
                  <option value="anamnese">Anamnese</option>
                  <option value="plano_terapeutico">Plano terapêutico</option>
                  <option value="alta">Alta</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Conteúdo (markdown)</Label>
              <Textarea
                name="contentMarkdown"
                rows={14}
                required
                placeholder={`Sessão #__\nQueixa: …\nObservação clínica: …\nIntervenção: …\nPlano: …`}
              />
              <p className="text-xs text-muted-foreground">
                O LUMA detecta temas (ansiedade, luto, sono, panico, vínculo conjugal etc.) e sugere próximos passos.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input id="sign" name="sign" type="checkbox" defaultChecked />
              <Label htmlFor="sign">Assinar digitalmente (gera hash ICP-Brasil mock)</Label>
            </div>
            <Button type="submit">Salvar e sumarizar com LUMA</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
