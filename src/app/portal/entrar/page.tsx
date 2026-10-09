import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortalShell } from "../_components/portal-shell";
import { loginAction } from "../_actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portal.login");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function PortalLoginPage() {
  if (await getPortalSession()) redirect("/portal");
  const t = await getTranslations("portal.login");
  return (
    <PortalShell>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={loginAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cpf">{t("cpf")}</Label>
              <Input id="cpf" name="cpf" inputMode="numeric" autoComplete="username" required placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">
              {t("submit")}
            </Button>
          </ActionForm>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer font-medium text-brand">{t("forgot")}</summary>
            <p className="mt-2 text-muted-foreground">{t("forgotHelp")}</p>
          </details>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-brand">{t("firstAccess")}</summary>
            <p className="mt-2 text-muted-foreground">{t("firstAccessHelp")}</p>
          </details>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
