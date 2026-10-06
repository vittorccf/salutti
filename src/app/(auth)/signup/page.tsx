import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoDialogo } from "@/components/brand/logo-dialogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "@/i18n/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getTranslations("auth.signup");
  return (
    <main className="ds2 ds2-glow min-h-screen grid place-items-center p-4 py-12">
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-[560px]">
        <CardHeader className="text-center">
          <LogoDialogo variant="icon" size={48} className="mx-auto" />
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
            <Link href="/login" className="text-primary-strong underline-offset-4 hover:underline">
              {t("login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
