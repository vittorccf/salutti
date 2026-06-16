import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword, setActiveWorkspaceCookie } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  workspaceName: z.string().min(2),
  segment: z.enum(["solo_psicologo", "solo_psicanalista", "clinica", "ubs", "odonto"]),
});

async function signupAction(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    workspaceName: formData.get("workspaceName"),
    segment: formData.get("segment"),
  });
  if (!parsed.success)
    redirect(`/signup?error=${encodeURIComponent("Preencha todos os campos com dados válidos.")}`);

  const exists = await db.user.findUnique({ where: { email: parsed.data!.email } });
  if (exists) redirect("/signup?error=Email+j%C3%A1+cadastrado");

  const trial = new Date();
  trial.setDate(trial.getDate() + 15);

  const slugBase = slugify(parsed.data!.workspaceName);
  let slug = slugBase;
  let i = 1;
  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${i++}`;
  }

  const user = await db.user.create({
    data: {
      email: parsed.data!.email,
      name: parsed.data!.name,
      passwordHash: await hashPassword(parsed.data!.password),
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: parsed.data!.workspaceName,
      slug,
      segment: parsed.data!.segment,
      trialEndsAt: trial,
      memberships: { create: { userId: user.id, role: "owner" } },
      anamnesisTemplates: {
        create: [
          {
            name: "Anamnese psicológica padrão",
            specialty: "psicologia",
            isDefault: true,
            schemaJson: JSON.stringify(defaultAnamnesis),
          },
        ],
      },
    },
  });

  await recordAudit({
    workspaceId: workspace.id,
    userId: user.id,
    action: "workspace.create",
    entity: "Workspace",
    entityId: workspace.id,
    metadata: { segment: parsed.data!.segment },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name });
  setActiveWorkspaceCookie(workspace.id);
  redirect("/app");
}

const defaultAnamnesis = {
  sections: [
    {
      title: "Identificação",
      questions: [
        { key: "queixa_principal", label: "Queixa principal", type: "textarea" },
        { key: "motivacao", label: "Motivação da busca", type: "textarea" },
      ],
    },
    {
      title: "História clínica",
      questions: [
        { key: "antecedentes", label: "Antecedentes pessoais", type: "textarea" },
        { key: "medicacoes", label: "Medicações em uso", type: "text" },
        { key: "sono", label: "Qualidade do sono", type: "select", options: ["Boa", "Regular", "Ruim"] },
      ],
    },
    {
      title: "Contexto",
      questions: [
        { key: "familia", label: "Configuração familiar", type: "textarea" },
        { key: "trabalho", label: "Vida profissional", type: "textarea" },
      ],
    },
  ],
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen grid place-content-center bg-gradient-to-br from-accent/30 to-background py-12">
      <Card className="w-[480px]">
        <CardHeader className="text-center">
          <CardTitle>Criar workspace Salutti</CardTitle>
          <CardDescription>15 dias grátis. Sem cartão.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signupAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Nome do consultório / clínica</Label>
              <Input id="workspaceName" name="workspaceName" required placeholder="Ex: Espaço Acolher" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment">Tipo de operação</Label>
              <Select id="segment" name="segment" defaultValue="solo_psicologo">
                <option value="solo_psicologo">Psicólogo autônomo</option>
                <option value="solo_psicanalista">Psicanalista / terapeuta (sem CRP)</option>
                <option value="clinica">Clínica multi-profissional</option>
                <option value="ubs">UBS / posto público</option>
                <option value="odonto">Consultório odontológico</option>
              </Select>
            </div>
            {params.error ? <p className="text-sm text-destructive">{params.error}</p> : null}
            <Button className="w-full">Criar workspace</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
