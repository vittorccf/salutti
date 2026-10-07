import type { Metadata } from "next";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/legal-page";
import { ArrowRight, Banknote, CalendarCheck, Camera, FileSignature, Package, PackageCheck, Repeat, Sparkles } from "lucide-react";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { AREAS } from "@/lib/areas";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AreaTheme } from "@/components/brand/area-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "@/i18n/server";

// Página inicial da Salutti Estética. Publicidade sem promessa de resultado estético (Res. CFF 658/2018).
// Textos em public.estetica.*.
const { loginPath, signupPath } = AREAS.estetica;

const features = [
  { key: "stock", icon: Package },
  { key: "consent", icon: FileSignature },
  { key: "followUp", icon: Repeat },
  { key: "schedule", icon: CalendarCheck },
  { key: "records", icon: Camera },
  { key: "finance", icon: Banknote },
];

const differentiators = ["trace", "fefo", "alerts"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.estetica");
  return { title: AREAS.estetica.name, description: t("metaDescription") };
}

export default async function EsteticaHome() {
  const t = await getTranslations("public.estetica");
  return (
    <main data-area="estetica" className="min-h-screen">
      <AreaTheme area="estetica" />
      <nav className="border-b bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex items-center justify-between gap-3 py-4">
          <Link href="/estetica" className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandLogo area="estetica" height={36} />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href={loginPath}>{t("login")}</Link>
            </Button>
            <Button asChild>
              <Link href={signupPath}>{t("tryFree")}</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="ds2-glow">
        <div className="container py-20 text-center">
          <Badge variant="muted" className="mb-4">
            <Sparkles className="h-3 w-3" aria-hidden /> {t("badge")}
          </Badge>
          <h1 className="text-hero mx-auto max-w-3xl">
            {t.rich("headline", { hl: (chunks) => <span className="text-accent-serif">{chunks}</span> })}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={signupPath}>
                {t("ctaCreate")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={loginPath}>{t("ctaLogin")}</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("fineprint")}</p>
        </div>
      </section>

      <section className="container pb-20 grid gap-4 md:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.key}>
              <CardContent className="p-6">
                <div className="grid h-10 w-10 place-content-center rounded-md bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-card-title mt-4">{t(`features.${f.key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`features.${f.key}.desc`)}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container grid gap-8 md:grid-cols-3">
          {differentiators.map((d) => (
            <div key={d}>
              <PackageCheck className="h-6 w-6" aria-hidden />
              <h3 className="text-card-title mt-3">{t(`differentiators.${d}.title`)}</h3>
              <p className="mt-1 text-sm opacity-80">{t(`differentiators.${d}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container py-10 text-sm text-muted-foreground text-center">
        <p className="mx-auto max-w-2xl text-xs">{t("disclaimer")}</p>
        <p className="mt-4">
          {t("footer")}{" "}
          <Link href={loginPath} className="text-brand underline-offset-4 hover:underline">
            {t("login")}
          </Link>
        </p>
        <p className="mt-2">
          {t("contact")} <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
        </p>
        <p className="mt-2">
          <Link href="/" className="text-brand underline-offset-4 hover:underline">
            {t("otherArea")}
          </Link>
        </p>
        <LegalLinks className="mt-2" />
      </footer>
    </main>
  );
}
