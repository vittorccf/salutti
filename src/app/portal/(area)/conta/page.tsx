import Link from "next/link";
import { LogOut, Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { formatCpf } from "@/lib/cpf";
import { getPortalSession } from "@/lib/portal-auth";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { changePasswordAction, logoutAction } from "../../_actions";

export default async function PortalAccountPage() {
  const access = (await getPortalSession())!;
  const { patient } = access;
  const [t, f] = await Promise.all([getTranslations("portal.account"), getFormat()]);
  const receipts = await db.receipt.findMany({ where: { patientId: patient.id, workspaceId: patient.workspaceId }, orderBy: { issuedAt: "desc" }, take: 12 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page-title">{patient.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          {t("login", { cpf: formatCpf(access.cpfDigits) })} · {patient.workspace.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("receipts")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noReceipts")}</p>
          ) : (
            <ul className="divide-y">
              {receipts.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-6 py-3 text-sm">
                  <span>
                    {t("receiptNumber", { number: r.receiptNumber })}
                    <span className="block text-muted-foreground">{f.date(r.issuedAt)}</span>
                  </span>
                  <span className="tabular-nums">{f.money(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand" aria-hidden /> {t("installTitle")}
          </CardTitle>
          <CardDescription>{t("installDescription")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("passwordTitle")}</CardTitle>
          <CardDescription>{t("passwordDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current">{t("current")}</Label>
              <PasswordInput id="current" name="current" autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("new")}</Label>
              <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">{t("confirm")}</Label>
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
            </div>
            <Button type="submit" variant="outline">
              {t("change")}
            </Button>
          </ActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/privacidade" className="text-brand underline-offset-4 hover:underline">
          {t("privacy")}
        </Link>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost">
            <LogOut className="h-4 w-4" aria-hidden /> {t("logout")}
          </Button>
        </form>
      </div>
    </div>
  );
}
