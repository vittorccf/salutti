import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { db } from "@/lib/db";
import { destroyBackofficeSession, recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import { backofficeRoleLabel } from "@/lib/backoffice/labels";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Separator } from "@/components/ui/separator";
import { APP_VERSION_FULL } from "@/lib/version";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/app/app/_components/mobile-nav";
import { BackofficeNav } from "../_components/backoffice-nav";

export const metadata = { title: "Backoffice · Salutti", robots: { index: false, follow: false } };

async function logoutAction() {
  "use server";
  const user = await requireBackoffice({ allowPendingPassword: true });
  await recordBackofficeAudit({ userId: user.id, action: "logout", entity: "BackofficeUser", entityId: user.id });
  destroyBackofficeSession();
  redirect("/backoffice/login");
}

export default async function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBackoffice();
  const unreadTickets = await db.supportTicket.count({ where: { unreadByStaff: true } });

  const sidebar = (
    <>
      <div className="p-5">
        <Link href="/backoffice" className="block space-y-1 rounded-md pr-10 md:pr-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandLogo height={28} />
          <span className="block text-xs font-medium uppercase tracking-wide text-brand">Backoffice</span>
        </Link>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <BackofficeNav isAdmin={user.role === "admin"} unreadTickets={unreadTickets} />
      </div>
      <Separator />
      <div className="space-y-2 p-4 text-sm">
        <p className="font-medium leading-tight">{user.name}</p>
        <p className="text-xs text-muted-foreground">
          {user.username} · {backofficeRoleLabel(user.role)}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href="/backoffice/senha">Trocar senha</Link>
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Sair">
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </div>
        <p className="text-[11px] text-muted-foreground/80">Versão {APP_VERSION_FULL}</p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col">{sidebar}</aside>
      <main className="min-h-screen min-w-0 bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur md:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <MobileNav>{sidebar}</MobileNav>
            <span className="text-sm font-semibold">Backoffice Salutti</span>
          </div>
        </header>
        <div className="mx-auto max-w-6xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
