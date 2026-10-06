import Link from "next/link";
import { redirect } from "next/navigation";
import { clearPendingTwoFactor, createSession, getPendingTwoFactor, setActiveWorkspaceCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { consumeRecoveryCode, decryptSecret, LOCK_AFTER, LOCK_MINUTES, verifyTotp } from "@/lib/totp";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const back = (erro: string) => redirect(`/login/verificar?erro=${erro}`);

async function verifyAction(formData: FormData) {
  "use server";
  const userId = await getPendingTwoFactor();
  if (!userId) redirect("/login?error=" + encodeURIComponent("A verificação expirou. Entre de novo."));
  const user = await db.user.findUnique({ where: { id: userId }, include: { memberships: true } });
  if (!user?.totpEnabledAt || !user.totpSecret) redirect("/login");

  if (user.totpLockedUntil && user.totpLockedUntil > new Date()) back("bloqueado");

  const code = String(formData.get("code") ?? "").trim();
  let ok = verifyTotp(decryptSecret(user.totpSecret), code);
  let usedRecovery = false;
  if (!ok) {
    const left = consumeRecoveryCode(user.totpRecoveryHashes, code);
    if (left) {
      ok = true;
      usedRecovery = true;
      await db.user.update({ where: { id: user.id }, data: { totpRecoveryHashes: JSON.stringify(left) } });
    }
  }

  if (!ok) {
    const attempts = user.totpFailedAttempts + 1;
    const lock = attempts >= LOCK_AFTER;
    await db.user.update({
      where: { id: user.id },
      data: {
        totpFailedAttempts: lock ? 0 : attempts,
        totpLockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    back(lock ? "bloqueado" : "codigo");
  }

  await db.user.update({ where: { id: user.id }, data: { totpFailedAttempts: 0, totpLockedUntil: null } });
  clearPendingTwoFactor();
  await createSession({ userId: user.id, email: user.email, name: user.name });
  const firstWs = user.memberships[0];
  if (firstWs) {
    setActiveWorkspaceCookie(firstWs.workspaceId);
    await recordAudit({
      workspaceId: firstWs.workspaceId,
      userId: user.id,
      action: usedRecovery ? "auth.2fa_recovery" : "auth.2fa",
      entity: "User",
      entityId: user.id,
    });
  }
  redirect("/app");
}

const ERROS: Record<string, string> = {
  codigo: "Código inválido. Confira o app autenticador e tente de novo.",
  bloqueado: `Muitas tentativas. Aguarde ${LOCK_MINUTES} minutos e entre de novo.`,
};

export default async function VerifyTwoFactorPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!(await getPendingTwoFactor())) redirect("/login");
  const { erro } = await searchParams;
  const message = erro && Object.hasOwn(ERROS, erro) ? ERROS[erro] : null;

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/30 to-background p-4">
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center">
          <Logo variant="icon" size={48} className="mx-auto" />
          <CardTitle>Verificação em duas etapas</CardTitle>
          <CardDescription>Digite o código de 6 dígitos do seu app autenticador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={verifyAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                name="code"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                className="text-center text-lg tracking-[0.3em] tabular-nums"
              />
            </div>
            {message ? (
              <p className="text-sm text-destructive-strong" role="alert">
                {message}
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Verificar
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sem acesso ao celular? Use um dos códigos de recuperação no mesmo campo.{" "}
            <Link href="/login" className="text-primary-strong underline-offset-4 hover:underline">
              Voltar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
