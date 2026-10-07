import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { BrandLogo } from "@/components/brand/brand-logo";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "@/i18n/server";
import { SignupForm } from "./signup-form";
import { AREAS, type Area } from "@/lib/areas";

// Tela de cadastro, usada por /signup (Salutti) e /estetica/cadastro (Salutti Estética).
export async function SignupScreen({ area = "mental" }: { area?: Area }) {
  const t = await getTranslations("auth.signup");
  const estetica = area === "estetica";
  return (
    <main className="ds2-glow min-h-screen grid place-items-center p-4 py-12">
      <div className="fixed right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-[560px]">
        <CardHeader className="text-center">
          <BrandLogo height={40} area={area} className="mx-auto" />
          <CardTitle>{estetica ? t("titleEstetica") : t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm area={area} />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
            <Link href={AREAS[area].loginPath} className="text-brand underline-offset-4 hover:underline">
              {t("login")}
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
