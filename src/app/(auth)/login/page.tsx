import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword, getSession, setActiveWorkspaceCookie } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartHandshake } from "lucide-react";

const schema = z.object({
  // Aceita email OU nome de usuário (ex.: "admin"). O valor é casado contra a coluna `email`.
  email: z.string().min(1, "Informe o email ou usuário"),
  password: z.string().min(1, "Informe a senha"),
});

async function loginAction(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return redirect(`/login?error=${encodeURIComponent("Dados inválidos")}`);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: true },
  });
  if (!user) return redirect("/login?error=Credenciais+inválidas");
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return redirect("/login?error=Credenciais+inválidas");

  await createSession({ userId: user.id, email: user.email, name: user.name });
  const firstWs = user.memberships[0];
  if (firstWs) setActiveWorkspaceCookie(firstWs.workspaceId);
  redirect("/app");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (session) redirect("/app");
  const params = await searchParams;

  return (
    <main className="min-h-screen grid place-content-center bg-gradient-to-br from-accent/30 to-background">
      <Card className="w-[400px]">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-content-center rounded-xl bg-primary text-primary-foreground">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <CardTitle>Entrar na Salutti</CardTitle>
          <CardDescription>Acesse seu workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email ou usuário</Label>
              <Input id="email" name="email" type="text" required placeholder="voce@clinica.com.br" defaultValue="guilherme@saluti.dev" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required defaultValue="saluti123" />
            </div>
            {params.error ? (
              <p className="text-sm text-destructive">{params.error}</p>
            ) : null}
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
          <div className="mt-6 rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-semibold">Demos prontas (senha: <code>saluti123</code>):</p>
            <ul className="list-disc pl-4 text-muted-foreground">
              <li>guilherme@saluti.dev — psicólogo autônomo (Goiânia)</li>
              <li>kris@saluti.dev — clínica odontológica UBS Turvânia</li>
            </ul>
          </div>
          <p className="mt-4 text-center text-sm">
            Novo por aqui?{" "}
            <Link className="text-primary underline" href="/signup">
              Criar workspace
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
