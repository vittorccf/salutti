import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getLocale, getTranslations } from "@/i18n/server";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/contact";
import { InstagramLink } from "@/components/brand/instagram-link";
import { LEGAL_ENTITY, LEGAL_VERSION, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";

// Moldura das páginas públicas /termos e /privacidade. O texto jurídico vale em português do Brasil;
// nos outros idiomas a página avisa isso no topo.
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getTranslations("public.legal");
  const locale = await getLocale();
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LEGAL_VERSION}T00:00:00Z`));
  return (
    <main className="min-h-screen bg-background">
      <header className="container flex items-center justify-between gap-4 py-6">
        <Link href="/" aria-label={t("home")}>
          <BrandLogo height={32} />
        </Link>
        <LanguageSwitcher />
      </header>
      <article className="container max-w-3xl pb-16">
        <h1 className="text-page-title">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("updatedAt", { date: updated, version: LEGAL_VERSION })}
        </p>
        {locale !== "pt-BR" ? (
          <p lang={locale} className="mt-4 rounded-md border bg-muted p-3 text-sm">
            {t("ptBrNotice")}
          </p>
        ) : null}
        <div lang="pt-BR" className="mt-8 space-y-6 text-sm leading-relaxed">
          {children}
        </div>
        <nav aria-label={t("otherDocs")} className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm">
          <Link href={TERMS_PATH} className="text-brand underline-offset-4 hover:underline">{t("terms")}</Link>
          <Link href={PRIVACY_PATH} className="text-brand underline-offset-4 hover:underline">{t("privacy")}</Link>
          <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
          <InstagramLink />
        </nav>
      </article>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-card-title">{title}</h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

// Links para os dois documentos, no rodapé das páginas públicas, do cadastro e do login.
export async function LegalLinks({ className }: { className?: string }) {
  const t = await getTranslations("public.legal");
  return (
    <p className={className}>
      <Link href={TERMS_PATH} className="text-brand underline-offset-4 hover:underline">{t("terms")}</Link>
      <span aria-hidden> · </span>
      <Link href={PRIVACY_PATH} className="text-brand underline-offset-4 hover:underline">{t("privacy")}</Link>
    </p>
  );
}

// Identificação de quem responde pela plataforma (src/lib/legal.ts), no início dos dois documentos.
export function EntityInfo() {
  const { name, document, address, dpo } = LEGAL_ENTITY;
  return (
    <p className="rounded-md border p-3">
      <strong>{name}</strong>
      {document ? <>, CNPJ {document}</> : null}
      {address ? <>, {address}</> : null}
      . Contato: <a href={supportMailto()} className="text-brand underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a>
      {dpo ? <>. Encarregado pelo tratamento de dados (DPO): {dpo}</> : null}.
    </p>
  );
}
