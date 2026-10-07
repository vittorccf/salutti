import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import {
  createBackofficeSession,
  getBackofficeUser,
  LOCK_MINUTES,
  MAX_ATTEMPTS,
  recordBackofficeAudit,
} from "@/lib/backoffice/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Backoffice · Salutti", robots: { index: false, follow: false } };

// Uma só mensagem para senha errada, usuário inexistente e bloqueio: não revela quais usuários existem.
const ERROR = `Usuário ou senha incorretos. Depois de ${MAX_ATTEMPTS} tentativas, o acesso fica bloqueado por ${LOCK_MINUTES} minutos.`;

const schema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });

async function loginAction(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) redirect("/backoffice/login?error=1");

  const user = await db.backofficeUser.findUnique({ where: { username: parsed.data.username.toLowerCase() } });
  // Mesma resposta para usuário inexistente, desativado ou senha errada.
  if (!user || !user.active) redirect("/backoffice/login?error=1");
  if (user.lockedUntil && user.lockedUntil > new Date()) redirect("/backoffice/login?error=1");

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    // Incremento atômico: tentativas em paralelo não escapam do limite.
    const { failedAttempts } = await db.backofficeUser.update({
      where: { id: user.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    const lock = failedAttempts >= MAX_ATTEMPTS;
    if (lock) {
      await db.backofficeUser.update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) },
      });
    }
    await recordBackofficeAudit({
      userId: user.id,
      action: lock ? "login.locked" : "login.failed",
      entity: "BackofficeUser",
      entityId: user.id,
    });
    redirect("/backoffice/login?error=1");
  }

  await db.backofficeUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await recordBackofficeAudit({ userId: user.id, action: "login", entity: "BackofficeUser", entityId: user.id });
  await createBackofficeSession(user.id);
  redirect(user.mustChangePassword ? "/backoffice/senha" : "/backoffice");
}

export default async function BackofficeLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  if (await getBackofficeUser()) redirect("/backoffice");
  const error = searchParams.error ? ERROR : null;

  return (
    <main className="ds2-glow grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center">
          <BrandLogo height={40} className="mx-auto" />
          <CardTitle>Backoffice</CardTitle>
          <CardDescription>Acesso restrito à equipe Salutti.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
