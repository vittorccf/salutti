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
import { defaultTemplateFor } from "@/lib/anamnesis-library";

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

  // Modelo de anamnese padrão do tipo de atendimento escolhido (biblioteca).
  const template = defaultTemplateFor(parsed.data!.segment);

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
            name: template.name,
            specialty: template.specialty,
            isDefault: true,
            schemaJson: JSON.stringify(template.schema),
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
  redirect("/app/primeiros-passos");
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/30 to-background p-4 py-12">
      <Card className="w-full max-w-[480px]">
        <CardHeader className="text-center">
          <CardTitle>Criar sua conta na Salutti</CardTitle>
          <CardDescription>15 dias grátis. Sem cartão.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signupAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required minLength={6} placeholder="Mínimo de 6 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Nome do consultório ou clínica</Label>
              <Input id="workspaceName" name="workspaceName" required placeholder="Espaço Acolher" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment">Tipo de atendimento</Label>
              <Select id="segment" name="segment" defaultValue="solo_psicologo">
                <option value="solo_psicologo">Psicólogo autônomo</option>
                <option value="solo_psicanalista">Psicanalista ou terapeuta (sem CRP)</option>
                <option value="clinica">Clínica multi-profissional</option>
                <option value="ubs">UBS / posto público</option>
                <option value="odonto">Consultório odontológico</option>
              </Select>
            </div>
            {params.error ? <p className="text-sm text-destructive-strong" role="alert">{params.error}</p> : null}
            <Button className="w-full">Criar conta</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary-strong underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
