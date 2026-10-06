import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/brand/logo";
import { WorkspaceSwitcher } from "./_components/workspace-switcher";
import { SidebarNav } from "./_components/sidebar-nav";
import { UserMenu } from "./_components/user-menu";
import { MobileNav } from "./_components/mobile-nav";
import { differenceInDays } from "date-fns";
import { planTierLabel, segmentLabel } from "@/lib/labels";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const trialDays = ctx.workspace.trialEndsAt
    ? Math.max(0, differenceInDays(ctx.workspace.trialEndsAt, new Date()))
    : null;

  const sidebar = (
    <>
      <div className="p-5">
        <Link href="/app" className="block space-y-1.5 rounded-md pr-10 md:pr-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo size={22} />
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
        <SidebarNav />
      </div>
      <Separator />
      <div className="p-3 space-y-3 text-sm">
        {trialDays !== null ? (
          <div className="rounded-md bg-warning/10 p-3 text-xs">
            <p className="font-semibold text-warning-strong">
              Teste grátis: {trialDays} {trialDays === 1 ? "dia restante" : "dias restantes"}
            </p>
            <p className="text-foreground/80">
              Plano <strong className="text-foreground">{planTierLabel(ctx.workspace.planTier)}</strong>
            </p>
          </div>
        ) : null}
        <UserMenu name={ctx.user.name} email={ctx.user.email} />
      </div>
    </>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col border-r bg-card">{sidebar}</aside>

      <main className="bg-background min-h-screen min-w-0">
        <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <MobileNav>{sidebar}</MobileNav>
              <Link href="/app" className="rounded-md md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Início">
                <Logo size={20} />
              </Link>
              <Badge variant="muted" className="hidden sm:inline-flex">
                {segmentLabel(ctx.workspace.segment)}
              </Badge>
              <p className="hidden truncate text-sm text-muted-foreground lg:block">
                LGPD ativo · auditoria habilitada · multi-tenant
              </p>
            </div>
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
