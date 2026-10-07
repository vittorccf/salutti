import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  ArrowRight,
  Banknote,
  Brain,
  CalendarCheck,
  FileSignature,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getTranslations } from "@/i18n/server";

// Textos em public.home.features.<chave> e public.home.differentiators.<chave>.
const features = [
  { key: "schedule", icon: <CalendarCheck className="h-5 w-5" /> },
  { key: "finance", icon: <Banknote className="h-5 w-5" /> },
  { key: "tax", icon: <FileSignature className="h-5 w-5" /> },
  { key: "saluttin", icon: <Brain className="h-5 w-5" /> },
  { key: "whatsapp", icon: <MessageSquareText className="h-5 w-5" /> },
  { key: "lgpd", icon: <ShieldCheck className="h-5 w-5" /> },
];

const differentiators = ["noCrp", "erp", "offline"];

export default async function Home() {
  const t = await getTranslations("public.home");
  return (
    <main className="min-h-screen">
      <nav className="border-b bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex items-center justify-between gap-3 py-4">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Salutti">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">{t("tryFree")}</Link>
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
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {t("subtitle")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              {t("ctaCreate")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">{t("ctaDemo")}</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("fineprint")}
        </p>
      </div>
      </section>

      <section className="container pb-20 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <Card key={f.key}>
            <CardContent className="p-6">
              <div className="grid h-10 w-10 place-content-center rounded-md bg-accent text-accent-foreground">
                {f.icon}
              </div>
              <h3 className="text-card-title mt-4">{t(`features.${f.key}.title`)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(`features.${f.key}.desc`)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container grid gap-8 md:grid-cols-3">
          {differentiators.map((d) => (
            <div key={d}>
              <Activity className="h-6 w-6" aria-hidden />
              <h3 className="text-card-title mt-3">{t(`differentiators.${d}.title`)}</h3>
              <p className="mt-1 text-sm opacity-80">{t(`differentiators.${d}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container py-10 text-sm text-muted-foreground text-center">
        <p>
          {t("footer")}{" "}
          <Link href="/login" className="text-brand underline-offset-4 hover:underline">
            {t("login")}
          </Link>
        </p>
        <p className="mt-2">
          {t("contact")} <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
        </p>
        <p className="mt-2">
          <Link href="/estetica" className="text-brand underline-offset-4 hover:underline">
            {t("esteticaLink")}
          </Link>
        </p>
      </footer>
    </main>
  );
}
