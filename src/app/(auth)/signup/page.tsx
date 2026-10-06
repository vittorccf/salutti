import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "@/i18n/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getTranslations("auth.signup");
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-accent/30 to-background p-4 py-12">
      <Card className="w-full max-w-[560px]">
        <CardHeader className="text-center">
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
