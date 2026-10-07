import { BrandLogo } from "@/components/brand/brand-logo";
import { AreaTheme } from "@/components/brand/area-theme";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WorkspaceSwitcher } from "./_components/workspace-switcher";
import { SidebarNav } from "./_components/sidebar-nav";
import { UserMenu } from "./_components/user-menu";
import { MobileNav } from "./_components/mobile-nav";
import { differenceInDays } from "date-fns";
import { getTranslations } from "next-intl/server";
import { labeler } from "@/i18n/labels";
import { canSeeClinical } from "@/lib/permissions";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/ui/avatar";
import type { Metadata } from "next";
import { AREAS, areaOf, moduleEnabled, type Module } from "@/lib/areas";

// Título da aba pela marca do consultório ativo: "Salutti" ou "Salutti Estética".
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getCurrentContext();
  return { title: AREAS[areaOf(ctx?.workspace.area)].name };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const trialDays = ctx.workspace.trialEndsAt
    ? Math.max(0, differenceInDays(ctx.workspace.trialEndsAt, new Date()))
    : null;

  const t = await getTranslations("common.layout");
  const label = labeler(await getTranslations("common.labels"));
  const avatarUrl = mediaUrl(ctx.user.avatarId);
  const bannerUrl = mediaUrl(ctx.workspace.bannerId);
  const brand = ctx.workspace.brandDisplay;
  const area = areaOf(ctx.workspace.area);
  // Com banner ou foto no lugar do logo, a marca da área aparece em texto logo abaixo.
  const customBrand = (brand === "banner" && bannerUrl) || (brand === "photo" && avatarUrl);
  const modules = (Object.keys(AREAS[area].modules) as Module[]).filter((m) => moduleEnabled(area, m));

  const sidebar = (
    <>
      <div className="p-5">
        <Link href="/app" className="block space-y-1.5 rounded-md pr-10 md:pr-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {brand === "banner" && bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por /api/media
            <img src={bannerUrl} alt="" className="max-h-16 w-full rounded-md object-contain object-left" />
          ) : brand === "photo" && avatarUrl ? (
            <span className="flex items-center gap-2.5">
              <Avatar src={avatarUrl} name={ctx.user.name} className="h-10 w-10" />
              <span className="min-w-0 font-semibold leading-tight">{ctx.user.name}</span>
            </span>
          ) : (
            <BrandLogo height={area === "mental" ? 28 : 36} area={area} />
          )}
          {AREAS[area].brandTag && customBrand ? (
            <span className="block text-xs font-medium text-brand">{AREAS[area].name}</span>
          ) : null}
          <span className="block text-xs text-muted-foreground">{ctx.workspace.name}</span>
        </Link>
        <div className="mt-4">
          <WorkspaceSwitcher
            key={ctx.workspace.id}
            workspaces={ctx.allWorkspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug }))}
            activeId={ctx.workspace.id}
          />
        </div>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav clinical={canSeeClinical(ctx.role)} modules={modules} />
      </div>
      {trialDays !== null ? (
        <>
          <Separator />
          <div className="p-3 text-sm">
            <div className="rounded-md bg-warning/10 p-3 text-xs">
              <p className="font-semibold text-warning-strong">{t("trialDays", { days: trialDays })}</p>
              <p className="text-foreground/80">
                {t("plan")} <strong className="text-foreground">{label("planTier", ctx.workspace.planTier)}</strong>
              </p>
            </div>
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <div data-area={area} className="min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <AreaTheme area={area} />
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col border-r bg-card">{sidebar}</aside>

      <main className="bg-background min-h-screen min-w-0">
        <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <MobileNav>{sidebar}</MobileNav>
              <Link href="/app" className="rounded-md md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("home")}>
                <BrandLogo variant="symbol" height={28} area={area} />
              </Link>
              <Badge variant="muted" className="hidden sm:inline-flex">
                {label("accountType", ctx.workspace.accountType)} · {label("segment", ctx.workspace.segment)}
              </Badge>
              <p className="hidden truncate text-sm text-muted-foreground lg:block">
                {t("compliance")}
              </p>
            </div>
            <UserMenu name={ctx.user.name} email={ctx.user.email} avatarUrl={avatarUrl} />
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
