import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword, getSession, setActiveWorkspaceCookie, startTwoFactor } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";
import { getTranslations } from "@/i18n/server";

// Erros vindos por ?error= (código curto; o texto fica nas mensagens auth.login.errors).
const ERRORS = ["dados", "credenciais", "expirou"] as const;

const schema = z.object({
  // Aceita email OU nome de usuário (ex.: "admin"). O valor é casado contra a coluna `email`.
  email: z.string().min(1),
  password: z.string().min(1),
});

async function loginAction(formData: FormData) {
  "use server";
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return redirect("/login?error=dados");

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: true },
  });
  if (!user) return redirect("/login?error=credenciais");
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return redirect("/login?error=credenciais");

  // Com verificação em duas etapas, a sessão só nasce depois do código.
  if (user.totpEnabledAt) {
    await startTwoFactor(user.id);
    redirect("/login/verificar");
  }

  await createSession({ userId: user.id, email: user.email, name: user.name });
  const firstWs = user.memberships[0];
  if (firstWs) setActiveWorkspaceCookie(firstWs.workspaceId);
  // Volta ao convite que mandou para o login (só caminhos internos de convite, nunca uma URL externa).
  const next = String(formData.get("next") ?? "");
  redirect(/^\/convite\/[A-Za-z0-9_-]+$/.test(next) ? next : "/app");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const session = await getSession();
  if (session) redirect("/app");
  const params = await searchParams;
  const t = await getTranslations("auth.login");
  const error = ERRORS.find((e) => e === params.error);

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/30 to-background p-4">
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center">
          <Logo variant="icon" size={48} className="mx-auto" />
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            {params.next ? <input type="hidden" name="next" value={params.next} /> : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="text" required placeholder={t("emailPlaceholder")} defaultValue="guilherme@salutti.dev" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" required defaultValue="salutti123" />
            </div>
            {error ? (
              <p className="text-sm text-destructive-strong" role="alert">{t(`errors.${error}`)}</p>
            ) : null}
            <Button type="submit" className="w-full">
              {t("submit")}
            </Button>
          </form>
          <div className="mt-6 rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-semibold">
              {t.rich("demoTitle", { password: "salutti123", code: (chunks) => <code>{chunks}</code> })}
            </p>
            <ul className="list-disc pl-4 text-muted-foreground">
              <li>{t("demoAutonomo", { email: "guilherme@salutti.dev" })}</li>
              <li>{t("demoClinica", { email: "kris@salutti.dev" })}</li>
            </ul>
          </div>
          <p className="mt-4 text-center text-sm">
            {t("newHere")}{" "}
            <Link className="text-primary-strong underline-offset-4 hover:underline" href="/signup">
              {t("createAccount")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
