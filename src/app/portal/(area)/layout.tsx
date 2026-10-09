import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-auth";
import { getTranslations } from "@/i18n/server";
import { PortalNav } from "../_components/portal-nav";

export const dynamic = "force-dynamic";

// Área logada do paciente: cabeçalho com o consultório e navegação inferior (como um app no celular).
export default async function PortalAreaLayout({ children }: { children: React.ReactNode }) {
  const access = await getPortalSession();
  if (!access) redirect("/portal/entrar");
  const t = await getTranslations("portal.nav");
  const unread = await db.portalMessage.count({ where: { patientId: access.patientId, fromPatient: false, readAt: null } });

  return (
    <div className="ds2-glow min-h-screen pb-24">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <BrandLogo height={22} />
          <span className="truncate text-sm font-medium text-muted-foreground">{access.patient.workspace.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <PortalNav
        labels={{ week: t("week"), messages: t("messages"), account: t("account"), nav: t("label"), unread: t("unread", { count: unread }) }}
        unread={unread}
      />
    </div>
  );
}
