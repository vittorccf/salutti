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
import { getFormat, getTranslations } from "@/i18n/server";
import { googleOAuthConfigured } from "@/lib/providers/google-login";
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

// Desvincula o Google só de quem tem senha: conta criada pelo Google ficaria sem como entrar.
async function unlinkGoogleAction() {
  "use server";
  const ctx = await requireContext();
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (!user.passwordHash) redirect(PAGE);
  await db.user.update({ where: { id: user.id }, data: { googleSub: null, googleEmail: null } });
  await audit(ctx, "auth.google_unlink");
  redirect(PAGE);
}

async function dismissCodesAction() {
  "use server";
  cookies().delete({ name: RECOVERY_COOKIE, path: PAGE });
  redirect(PAGE);
}

// Resultado do vínculo com o Google (?google=, vindo de /api/auth/google/retorno) → chave em auth.security.
const GOOGLE_STATUS = { ok: "googleOk", emuso: "googleInUse", email: "googleEmail", erro: "googleError" } as const;

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ erro?: string; google?: string }> }) {
  const ctx = await requireContext();
  const { erro, google: googleStatus } = await searchParams;
  const googleMessage = googleStatus && googleStatus in GOOGLE_STATUS ? GOOGLE_STATUS[googleStatus as keyof typeof GOOGLE_STATUS] : null;
  const t = await getTranslations("auth.security");
  const f = await getFormat();
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
        <h1 className="text-page-title flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </header>

      {erro === "codigo" ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {t("codeInvalid")}
        </p>
      ) : null}

      {googleMessage ? (
        <p
          role={googleMessage === "googleOk" ? "status" : "alert"}
          className={
            googleMessage === "googleOk"
              ? "rounded-md bg-success/10 p-3 text-sm text-success-strong"
              : "rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
          }
        >
          {t(googleMessage)}
        </p>
      ) : null}

      {recoveryCodes ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>{t("recoveryTitle")}</CardTitle>
            <CardDescription>{t("recoveryDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label={t("recoveryList")}>
              {recoveryCodes.map((c) => (
                <li key={c} className="rounded-md border bg-muted/40 px-3 py-2 text-center tabular-nums">
                  {c}
                </li>
              ))}
            </ul>
            <form action={dismissCodesAction}>
              <Button type="submit">{t("recoveryDismiss")}</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("twoFactorTitle")}
            {enabled ? <Badge variant="success">{t("active")}</Badge> : <Badge variant="muted">{t("inactive")}</Badge>}
          </CardTitle>
          <CardDescription>{t("twoFactorDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {enabled ? (
            <>
              <p className="text-muted-foreground">
                {t("activeSince", { date: f.date(user.totpEnabledAt!) })} · {t("recoveryRemaining", { count: remaining })}
              </p>
              <form action={regenerateAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="regen-code">{t("currentCode")}</Label>
                  <Input id="regen-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit" variant="outline">
                  {t("regenerate")}
                </Button>
              </form>
              <form action={disableAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="disable-code">{t("currentCode")}</Label>
                  <Input id="disable-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit" variant="destructive">
                  {t("disable")}
                </Button>
              </form>
            </>
          ) : qr ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>{t("step1")}</li>
                <li>{t("step2")}</li>
              </ol>
              <div className="flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerado no servidor */}
                <img src={qr.dataUrl} alt={t("qrAlt")} width={200} height={200} className="rounded-md border bg-white p-2" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("noCamera")}</p>
                  <code className="block break-all rounded-md bg-muted/40 p-2 font-mono text-xs" data-testid="totp-secret">
                    {qr.secret}
                  </code>
                </div>
              </div>
              <form action={confirmAction} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="confirm-code">{t("appCode")}</Label>
                  <Input id="confirm-code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="w-36 tabular-nums" required />
                </div>
                <Button type="submit">{t("enable")}</Button>
              </form>
            </>
          ) : (
            <form action={startAction}>
              <Button type="submit">{t("setup")}</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("googleTitle")}
            {user.googleSub ? <Badge variant="success">{t("googleLinked")}</Badge> : <Badge variant="muted">{t("googleNotLinked")}</Badge>}
          </CardTitle>
          <CardDescription>{t("googleDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {user.googleSub ? (
            <>
              {user.googleEmail ? <p className="text-muted-foreground">{t("googleAccount", { email: user.googleEmail })}</p> : null}
              {user.passwordHash ? (
                <form action={unlinkGoogleAction}>
                  <Button type="submit" variant="outline">
                    {t("googleUnlink")}
                  </Button>
                </form>
              ) : (
                <p className="text-muted-foreground">{t("googleOnly")}</p>
              )}
            </>
          ) : googleOAuthConfigured() ? (
            <Button variant="outline" asChild>
              <a href="/api/auth/google/iniciar?vincular=1">{t("googleLink")}</a>
            </Button>
          ) : (
            <p className="text-muted-foreground">{t("googleUnavailable")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
