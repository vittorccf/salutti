import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { hashInviteToken } from "@/lib/portal-auth";
import { getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortalShell } from "../../_components/portal-shell";
import { redeemInviteAction } from "../../_actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.invite");
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

// Convite: o paciente confirma quem é (data de nascimento e/ou CPF do cadastro) e cria a senha.
// A página não mostra nenhum dado do paciente: quem tem só o link não descobre nada.
export default async function PortalInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("portal.invite");
  const access = await db.patientPortalAccess.findFirst({
    where: { inviteTokenHash: hashInviteToken(token), inviteExpiresAt: { gt: new Date() }, active: true },
    include: { patient: { select: { birthDate: true, cpf: true, deletedAt: true, workspace: { select: { name: true } } } } },
  });

  if (!access || access.patient.deletedAt || (!access.patient.birthDate && !access.patient.cpf)) {
    return (
      <PortalShell>
        <Card>
          <CardHeader>
            <CardTitle>{t("invalidTitle")}</CardTitle>
            <CardDescription>{t("invalidDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/portal/entrar" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
              {t("goLogin")}
            </Link>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }
  const reset = !!access.activatedAt;

  return (
    <PortalShell>
      <Card>
        <CardHeader>
          <CardTitle>{reset ? t("resetTitle") : t("title")}</CardTitle>
          <CardDescription>{t("description", { workspace: access.patient.workspace.name })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={redeemInviteAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            {access.patient.birthDate ? (
              <div className="space-y-1.5">
                <Label htmlFor="birthDate">{t("birthDate")}</Label>
                <Input id="birthDate" name="birthDate" type="date" required autoComplete="bday" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="cpf">{t("cpf")}</Label>
              <Input id="cpf" name="cpf" inputMode="numeric" autoComplete="username" required placeholder="000.000.000-00" aria-describedby="cpf-hint" />
              <p id="cpf-hint" className="text-xs text-muted-foreground">
                {t("cpfHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} aria-describedby="password-hint" />
              <p id="password-hint" className="text-xs text-muted-foreground">
                {t("passwordHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("confirm")}</Label>
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
            </div>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                {t("accept")}{" "}
                <Link href="/privacidade" target="_blank" className="text-brand underline-offset-4 hover:underline">
                  {t("privacy")}
                </Link>
              </span>
            </label>
            <Button type="submit" className="w-full">
              {reset ? t("submitReset") : t("submit")}
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
