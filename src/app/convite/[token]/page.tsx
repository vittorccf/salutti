import { Logo } from "@/components/brand/logo";
import { NewPasswordFields } from "@/components/forms/password-input";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, getSession, hashPassword, setActiveWorkspaceCookie } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { acceptInvitation, findInvitation } from "@/lib/invitations";
import { getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";

export const dynamic = "force-dynamic";

const ERRORS = ["dados", "email", "senha"] as const;

async function finish(invitationId: string, workspaceId: string, userId: string, role: string) {
  await acceptInvitation(invitationId, userId);
  await recordAudit({ workspaceId, userId, action: "team.join", entity: "Invitation", entityId: invitationId, metadata: { role } });
  setActiveWorkspaceCookie(workspaceId);
  redirect("/app");
}

// Quem já está logado com o e-mail convidado: só confirma.
async function acceptAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const inv = await findInvitation(token);
  const session = await getSession();
  if (!inv || !session) redirect(`/convite/${token}`);
  if (session.email.toLowerCase() !== inv.email.toLowerCase()) redirect(`/convite/${token}?erro=email`);
  await finish(inv.id, inv.workspaceId, session.userId, inv.role);
}

// Quem ainda não tem conta: cria com o e-mail do convite e já entra na equipe.
async function createAccountAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token"));
  const inv = await findInvitation(token);
  if (!inv) redirect(`/convite/${token}`);
  const parsed = z
    .object({ name: z.string().trim().min(2).max(120), password: z.string().min(8).max(200) })
    .safeParse({ name: formData.get("name"), password: formData.get("password") });
  if (!parsed.success) redirect(`/convite/${token}?erro=dados`);
  if (formData.get("passwordConfirm") !== parsed.data.password) redirect(`/convite/${token}?erro=senha`);
  if (await db.user.findFirst({ where: { email: { equals: inv.email, mode: "insensitive" } } })) redirect(`/convite/${token}`);
  const user = await db.user.create({
    data: { email: inv.email.toLowerCase(), name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) },
  });
  await createSession({ userId: user.id, email: user.email, name: user.name });
  await finish(inv.id, inv.workspaceId, user.id, inv.role);
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const t = await getTranslations("auth.invite");
  const label = labeler(await getTranslations("common.labels"));
  const inv = await findInvitation(params.token);
  const session = await getSession();
  const hasAccount = inv ? Boolean(await db.user.findFirst({ where: { email: { equals: inv.email, mode: "insensitive" } } })) : false;
  const error = ERRORS.find((e) => e === erro);

  return (
    <main className="min-h-screen ds2-glow grid place-items-center p-4">
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-[440px]">
        <CardHeader className="text-center">
          <Logo variant="symbol" size={48} className="mx-auto" />
          {inv ? (
            <>
              <CardTitle>{t("title", { workspace: inv.workspace.name })}</CardTitle>
              <CardDescription>{t("description", { role: label("role", inv.role), email: inv.email })}</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>{t("invalidTitle")}</CardTitle>
              <CardDescription>{t("invalidDescription")}</CardDescription>
            </>
          )}
        </CardHeader>
        {inv ? (
          <CardContent className="space-y-4">
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/[.12] p-3 text-sm text-destructive-strong">
                {t(`errors.${error}`, { email: inv.email })}
              </p>
            ) : null}
            {session ? (
              <form action={acceptAction} className="space-y-3">
                <input type="hidden" name="token" value={params.token} />
                <p className="text-sm text-muted-foreground">{t("loggedAs", { email: session.email })}</p>
                <Button type="submit" className="w-full">{t("accept")}</Button>
              </form>
            ) : hasAccount ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{t("hasAccount")}</p>
                <Button className="w-full" asChild>
                  <Link href={`/login?next=${encodeURIComponent(`/convite/${params.token}`)}`}>{t("login")}</Link>
                </Button>
              </div>
            ) : (
              <form action={createAccountAction} className="space-y-3">
                <input type="hidden" name="token" value={params.token} />
                <div className="space-y-1">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input id="name" name="name" required autoComplete="name" />
                </div>
                <NewPasswordFields label={t("password")} className="sm:grid-cols-1" />
                <Button type="submit" className="w-full">{t("createAndJoin")}</Button>
              </form>
            )}
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
