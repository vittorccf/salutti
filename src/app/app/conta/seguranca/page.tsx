import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/totp";
import { formatDateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const PAGE = "/app/conta/seguranca";
// Códigos de recuperação recém-gerados: mostrados uma vez, via cookie cifrado de curta duração.
const RECOVERY_COOKIE = "salutti_recovery_once";

const audit = (ctx: Awaited<ReturnType<typeof requireContext>>, action: string) =>
  recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action, entity: "User", entityId: ctx.user.id });

const showRecoveryCodes = (codes: string[]) =>
  cookies().set(RECOVERY_COOKIE, encryptSecret(JSON.stringify(codes)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: PAGE,
    maxAge: 300,
  });

// Confere o código atual do usuário (exigido para desativar ou trocar os códigos).
async function currentUserCodeOk(userId: string, code: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  return Boolean(user?.totpEnabledAt && user.totpSecret && verifyTotp(decryptSecret(user.totpSecret), code));
}

async function startAction() {
  "use server";
  const ctx = await requireContext();
  await db.user.update({
    where: { id: ctx.user.id },
    data: { totpSecret: encryptSecret(generateTotpSecret()), totpEnabledAt: null, totpRecoveryHashes: null },
  });
  redirect(PAGE);
}

async function confirmAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const user = await db.user.findUnique({ where: { id: ctx.user.id } });
  if (!user?.totpSecret || user.totpEnabledAt) redirect(PAGE);
  if (!verifyTotp(decryptSecret(user.totpSecret), String(formData.get("code") ?? ""))) redirect(`${PAGE}?erro=codigo`);
  const { codes, hashes } = generateRecoveryCodes();
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpRecoveryHashes: JSON.stringify(hashes), totpFailedAttempts: 0 },
  });
  showRecoveryCodes(codes);
  await audit(ctx, "auth.2fa_enable");
  redirect(PAGE);
}

async function disableAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  if (!(await currentUserCodeOk(ctx.user.id, String(formData.get("code") ?? "")))) redirect(`${PAGE}?erro=codigo`);
  await db.user.update({
    where: { id: ctx.user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpRecoveryHashes: null, totpFailedAttempts: 0, totpLockedUntil: null },
  });
  await audit(ctx, "auth.2fa_disable");
  redirect(PAGE);
}

async function regenerateAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  if (!(await currentUserCodeOk(ctx.user.id, String(formData.get("code") ?? "")))) redirect(`${PAGE}?erro=codigo`);
  const { codes, hashes } = generateRecoveryCodes();
  await db.user.update({ where: { id: ctx.user.id }, data: { totpRecoveryHashes: JSON.stringify(hashes) } });
  showRecoveryCodes(codes);
  await audit(ctx, "auth.2fa_recovery_regenerate");
  redirect(PAGE);
}

async function dismissCodesAction() {
  "use server";
  cookies().delete({ name: RECOVERY_COOKIE, path: PAGE });
  redirect(PAGE);
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const ctx = await requireContext();
  const { erro } = await searchParams;
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const enabled = Boolean(user.totpEnabledAt);
  const pending = Boolean(user.totpSecret) && !enabled;

  let recoveryCodes: string[] | null = null;
  const once = cookies().get(RECOVERY_COOKIE)?.value;
  if (once) {
    try {
      recoveryCodes = JSON.parse(decryptSecret(once)) as string[];
    } catch {
      recoveryCodes = null;
    }
  }

  let qr: { dataUrl: string; secret: string } | null = null;
  if (pending && user.totpSecret) {
    const secret = decryptSecret(user.totpSecret);
    qr = { secret, dataUrl: await QRCode.toDataURL(otpauthUrl(secret, user.email), { margin: 1, width: 200 }) };
  }
  const remaining = user.totpRecoveryHashes ? (JSON.parse(user.totpRecoveryHashes) as string[]).length : 0;

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary-strong" aria-hidden /> Segurança da conta
        </h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </header>

      {erro === "codigo" ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          Código inválido. Confira o app autenticador e tente de novo.
        </p>
      ) : null}

      {recoveryCodes ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Guarde seus códigos de recuperação</CardTitle>
            <CardDescription>
              Cada código entra uma vez, se você perder o celular. Eles não serão mostrados de novo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label="Códigos de recuperação">
              {recoveryCodes.map((c) => (
                <li key={c} className="rounded-md border bg-muted/40 px-3 py-2 text-center tabular-nums">
                  {c}
                </li>
              ))}
            </ul>
            <form action={dismissCodesAction}>
              <Button type="submit">Já guardei os códigos</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Verificação em duas etapas
            {enabled ? <Badge variant="success">Ativa</Badge> : <Badge variant="muted">Desativada</Badge>}
          </CardTitle>
          <CardDescription>
            Além da senha, o login pede um código do app autenticador (Google Authenticator, Microsoft Authenticator,
            1Password).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {enabled ? (
            <>
              <p className="text-muted-foreground">
                Ativa desde {formatDateBR(user.totpEnabledAt!)} ·{" "}
                {remaining === 1 ? "1 código de recuperação restante" : `${remaining} códigos de recuperação restantes`}
              </p>
              <form action={regenerateAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="regen-code">Código atual</Label>
                  <Input id="regen-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit" variant="outline">
                  Gerar novos códigos de recuperação
                </Button>
              </form>
              <form action={disableAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="disable-code">Código atual</Label>
                  <Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit" variant="destructive">
                  Desativar verificação
                </Button>
              </form>
            </>
          ) : qr ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Abra o app autenticador e escaneie o QR code.</li>
                <li>Digite o código de 6 dígitos que aparecer.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerado no servidor */}
                <img src={qr.dataUrl} alt="QR code para o app autenticador" width={200} height={200} className="rounded-md border bg-white p-2" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Sem câmera? Digite a chave:</p>
                  <code className="block break-all rounded-md bg-muted/40 p-2 font-mono text-xs" data-testid="totp-secret">
                    {qr.secret}
                  </code>
                </div>
              </div>
              <form action={confirmAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="confirm-code">Código do app</Label>
                  <Input id="confirm-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit">Ativar verificação</Button>
              </form>
            </>
          ) : (
            <form action={startAction}>
              <Button type="submit">Configurar verificação em duas etapas</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
