import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { PasswordInput } from "@/components/forms/password-input";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AreaTheme } from "@/components/brand/area-theme";
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
import { getTranslations } from "@/i18n/server";
import { AREAS, areaOf, type Area } from "@/lib/areas";

// Erros vindos por ?error= (código curto; o texto fica nas mensagens auth.login.errors).
const ERRORS = ["dados", "credenciais", "expirou"] as const;

const schema = z.object({
  // Aceita email OU nome de usuário (ex.: "admin"). O valor é casado contra a coluna `email`.
  email: z.string().min(1),
  password: z.string().min(1),
});

// Mesmo login para todas as áreas; a área só decide para qual tela voltam os erros (a marca no app vem do consultório).
async function loginAction(formData: FormData) {
  "use server";
  const loginPath = AREAS[areaOf(String(formData.get("area") ?? ""))].loginPath;
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return redirect(`${loginPath}?error=dados`);

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: true },
  });
  if (!user) return redirect(`${loginPath}?error=credenciais`);
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return redirect(`${loginPath}?error=credenciais`);

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

export type LoginSearchParams = Promise<{ error?: string; next?: string }>;

// Tela de login, usada por /login (Salutti) e /estetica/login (Salutti Estética).
export async function LoginScreen({ area = "mental", searchParams }: { area?: Area; searchParams: LoginSearchParams }) {
  const session = await getSession();
  if (session) redirect("/app");
  const params = await searchParams;
  const t = await getTranslations("auth.login");
  const estetica = area === "estetica";
  const error = ERRORS.find((e) => e === params.error);

  return (
    <main data-area={area} className="ds2-glow min-h-screen grid place-items-center p-4">
      <AreaTheme area={area} />
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-[400px]">
        <CardHeader className="text-center">
          <BrandLogo height={area === "mental" ? 40 : 46} area={area} className="mx-auto" />
          <CardTitle>{estetica ? t("titleEstetica") : t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="area" value={area} />
            {params.next ? <input type="hidden" name="next" value={params.next} /> : null}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="text" required placeholder={t("emailPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <PasswordInput id="password" name="password" required autoComplete="current-password" />
            </div>
            {error ? (
              <p className="text-sm text-destructive-strong" role="alert">{t(`errors.${error}`)}</p>
            ) : null}
            <Button type="submit" className="w-full">
              {t("submit")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            {t("newHere")}{" "}
            <Link className="text-brand underline-offset-4 hover:underline" href={AREAS[area].signupPath}>
              {t("createAccount")}
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("help")} <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
