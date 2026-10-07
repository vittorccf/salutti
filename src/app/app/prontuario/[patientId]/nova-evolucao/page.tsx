import { notFound, redirect } from "next/navigation";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import crypto from "node:crypto";
import { z } from "zod";
import { requireClinicalContext } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { saluttin } from "@/lib/providers/llm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assertInWorkspace } from "@/lib/tenant";
import { getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { SALUTTIN_ENABLED } from "@/lib/features";

// Ordem das opções no formulário (a primeira é a padrão).
const NOTE_TYPES = ["evolucao", "anamnese", "plano_terapeutico", "alta"] as const;

const schema = z.object({
  professionalId: z.string(),
  appointmentId: z.string().optional(),
  noteType: z.enum(NOTE_TYPES),
  contentMarkdown: z.string().min(20),
  sign: z.string().optional(),
});

async function saveNoteAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const ctx = await requireClinicalContext();
  const patientId = formData.get("patientId") as string;
  const parsed = schema.safeParse({
    professionalId: formData.get("professionalId"),
    appointmentId: formData.get("appointmentId") || undefined,
    noteType: formData.get("noteType"),
    contentMarkdown: formData.get("contentMarkdown"),
    sign: formData.get("sign") || undefined,
  });
  // Texto curto demais (ou campo adulterado) volta como mensagem, sem derrubar a página nem apagar o que foi escrito.
  if (!parsed.success) {
    const t = await getTranslations("patients.note.errors");
    return { erro: parsed.error.issues.some((i) => i.path[0] === "contentMarkdown") ? t("tooShort") : t("invalid") };
  }
  const data = parsed.data;

  const patient = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!patient) redirect("/app/pacientes");
  await assertInWorkspace(ctx.workspace.id, {
    patientId,
    professionalId: data.professionalId,
    appointmentId: data.appointmentId || null,
  });

  // Saluttin oculto: nada vai para a IA e a evolução fica sem resumo.
  const aiOutput = SALUTTIN_ENABLED
    ? await saluttin.summarizeSession({ text: data.contentMarkdown, patientName: patient.fullName })
    : null;

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
      aiSummary: aiOutput?.summary ?? null,
      aiTopics: aiOutput ? aiOutput.topics.join(",") : null,
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
  const ctx = await requireClinicalContext();
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
  const [t, tLabels] = await Promise.all([getTranslations("patients.note"), getTranslations("common.labels")]);
  const label = labeler(tLabels);

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("title", { name: patient.fullName })}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveNoteAction} className="space-y-4">
            <input type="hidden" name="patientId" value={patient.id} />
            {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="professionalId">{t("professional")}</Label>
                <Select name="professionalId" id="professionalId" required>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="noteType">{t("type")}</Label>
                <Select name="noteType" id="noteType" defaultValue="evolucao">
                  {NOTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {label("noteType", type)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="contentMarkdown">{t("content")}</Label>
              <Textarea
                name="contentMarkdown" id="contentMarkdown"
                rows={14}
                required
                placeholder={t("placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("hint")}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input id="sign" name="sign" type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
              <Label htmlFor="sign">{t("sign")}</Label>
            </div>
            <Button type="submit">{t("submit")}</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
