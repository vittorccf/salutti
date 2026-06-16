import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

type AnamnesisSchema = {
  sections: {
    title: string;
    questions: { key: string; label: string; type: "text" | "textarea" | "select"; options?: string[] }[];
  }[];
};

async function applyAnamnesisAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  const templateId = formData.get("templateId") as string;
  const professionalId = formData.get("professionalId") as string;

  const template = await db.anamnesisTemplate.findFirst({
    where: { id: templateId, workspaceId: ctx.workspace.id },
  });
  if (!template) redirect(`/app/prontuario/${patientId}`);
  const schema = JSON.parse(template.schemaJson) as AnamnesisSchema;

  const answers: Record<string, string> = {};
  for (const section of schema.sections) {
    for (const q of section.questions) {
      answers[q.key] = (formData.get(q.key) as string) || "";
    }
  }

  const markdown =
    `# Anamnese: ${template.name}\n\n` +
    schema.sections
      .map(
        (s) =>
          `## ${s.title}\n\n` +
          s.questions
            .map((q) => `**${q.label}:**\n${answers[q.key] || "_(não respondido)_"}\n`)
            .join("\n"),
      )
      .join("\n");

  const note = await db.clinicalNote.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId,
      professionalId,
      noteType: "anamnese",
      contentMarkdown: markdown,
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "anamnesis.apply",
    entity: "ClinicalNote",
    entityId: note.id,
    metadata: { templateId },
  });
  redirect(`/app/prontuario/${patientId}`);
}

export default async function AnamnesisPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const ctx = await requireContext();
  const { patientId } = await params;
  const [patient, templates, professionals] = await Promise.all([
    db.patient.findFirst({ where: { id: patientId, workspaceId: ctx.workspace.id, deletedAt: null } }),
    db.anamnesisTemplate.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    db.professional.findMany({ where: { workspaceId: ctx.workspace.id, active: true } }),
  ]);
  if (!patient) notFound();

  const defaultTpl = templates.find((t) => t.isDefault) ?? templates[0];
  if (!defaultTpl) {
    return (
      <Card>
        <CardContent className="p-6">
          <p>Sem templates de anamnese. Crie um em <code>/app/ajustes</code>.</p>
        </CardContent>
      </Card>
    );
  }
  const schema = JSON.parse(defaultTpl.schemaJson) as AnamnesisSchema;

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Anamnese · {patient.fullName}</CardTitle>
          <CardDescription>
            Template aplicável: <strong>{defaultTpl.name}</strong>. Personalize seções e perguntas nos Ajustes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={applyAnamnesisAction} className="space-y-6">
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="templateId" value={defaultTpl.id} />
            <div className="space-y-1">
              <Label>Profissional responsável</Label>
              <Select name="professionalId" required>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            {schema.sections.map((s) => (
              <div key={s.title} className="space-y-3 border-l-2 border-primary/30 pl-4">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                {s.questions.map((q) => (
                  <div key={q.key} className="space-y-1">
                    <Label htmlFor={q.key}>{q.label}</Label>
                    {q.type === "textarea" ? (
                      <Textarea id={q.key} name={q.key} rows={3} />
                    ) : q.type === "select" ? (
                      <Select id={q.key} name={q.key}>
                        <option value="">—</option>
                        {q.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input id={q.key} name={q.key} />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <Button type="submit">Salvar anamnese</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
