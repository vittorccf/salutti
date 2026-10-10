import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Banknote, CalendarClock, CalendarCheck, ClipboardList, FlaskConical, Receipt, Smile, Stethoscope } from "lucide-react";
import { LegalLinks } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { AREAS } from "@/lib/areas";
import { PERMANENT_ROWS } from "@/lib/odonto";
import { BrandLogo } from "@/components/brand/brand-logo";
import { InstagramLink } from "@/components/brand/instagram-link";
import { AreaTheme } from "@/components/brand/area-theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "@/i18n/server";

// Página inicial da Salutti Odonto. Divulgação sem promessa de resultado, sem "antes e depois" e sem preço como
// chamariz (Código de Ética Odontológica, Res. CFO 118/2012, e Res. CFO 196/2019). Textos em public.odonto.*.
const { loginPath, signupPath } = AREAS.odonto;

const features = [
  { key: "odontogram", icon: Smile },
  { key: "plan", icon: ClipboardList },
  { key: "budget", icon: Receipt },
  { key: "lab", icon: FlaskConical },
  { key: "recall", icon: CalendarClock },
  { key: "schedule", icon: CalendarCheck },
  { key: "records", icon: Stethoscope },
  { key: "finance", icon: Banknote },
];

const differentiators = ["fdi", "approve", "team"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.odonto");
  return { title: AREAS.odonto.name, description: t("metaDescription") };
}

export default async function OdontoHome() {
  const t = await getTranslations("public.odonto");
  // Amostra do odontograma no hero: dentes com a mesma notação e as mesmas cores do app.
  const sample: Record<number, string> = { 16: "carie", 26: "restaurado", 36: "tratamento", 46: "ausente", 24: "implante", 11: "restaurado" };
  return (
    <main data-area="odonto" className="min-h-screen">
      <AreaTheme area="odonto" />
      <nav className="border-b bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex items-center justify-between gap-3 py-4">
          <Link href="/odonto" className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandLogo area="odonto" height={36} />
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
            {t("badge")}
          </Badge>
          <h1 className="text-hero mx-auto max-w-3xl">{t.rich("headline", { hl: (chunks) => <span className="text-accent-serif">{chunks}</span> })}</h1>
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

          <figure className="mx-auto mt-12 max-w-full overflow-x-auto" aria-label={t("sampleLabel")}>
            <div className="inline-grid gap-1.5 rounded-xl border bg-card p-4 shadow-sm">
              {PERMANENT_ROWS.map((row, r) => (
                <div key={r} className="flex items-center gap-3">
                  {row.map((quad, q) => (
                    <div key={q} className="flex gap-1">
                      {quad.map((n) => (
                        <span key={n} className={`tooth-cell tooth-cell--${sample[n] ?? "higido"}`} aria-hidden>
                          {n}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <figcaption className="mt-2 text-xs text-muted-foreground">{t("sampleCaption")}</figcaption>
          </figure>
        </div>
      </section>

      <section className="container pb-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <h3 className="text-card-title">{t(`differentiators.${d}.title`)}</h3>
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
          {t("contact")}{" "}
          <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-2">
          <InstagramLink />
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
