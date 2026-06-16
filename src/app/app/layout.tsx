import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WorkspaceSwitcher } from "./_components/workspace-switcher";
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  FileSignature,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  UserSquare2,
  MessageSquareText,
} from "lucide-react";
import { differenceInDays } from "date-fns";

const nav = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "Pacientes", icon: Users },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/prontuario", label: "Prontuário", icon: ClipboardList },
  { href: "/app/financeiro", label: "Financeiro", icon: Banknote },
  { href: "/app/fiscal", label: "Fiscal", icon: FileSignature },
  { href: "/app/luma", label: "LUMA · IA", icon: Sparkles },
  { href: "/app/comunicacao", label: "Comunicação", icon: MessageSquareText },
  { href: "/app/equipe", label: "Profissionais", icon: Stethoscope },
  { href: "/app/lgpd", label: "LGPD", icon: ShieldCheck },
  { href: "/app/ajustes", label: "Ajustes", icon: UserSquare2 },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const trialDays = ctx.workspace.trialEndsAt
    ? Math.max(0, differenceInDays(ctx.workspace.trialEndsAt, new Date()))
    : null;

  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: "260px 1fr" }}>
      <aside className="border-r bg-card flex flex-col">
        <div className="p-5">
          <Link href="/app" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-content-center rounded-lg bg-primary text-primary-foreground">
              <HeartHandshake className="h-5 w-5" />
            </span>
            <span>
              Salutti
              <span className="block text-xs font-normal text-muted-foreground">
                {ctx.workspace.name}
              </span>
            </span>
          </Link>
          <div className="mt-4">
            <WorkspaceSwitcher
              workspaces={ctx.allWorkspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug }))}
              activeId={ctx.workspace.id}
            />
          </div>
        </div>
        <Separator />
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator />
        <div className="p-4 space-y-3 text-sm">
          {trialDays !== null ? (
            <div className="rounded-md bg-warning/10 p-3 text-warning-foreground text-xs">
              <p className="font-semibold text-warning">Trial: {trialDays} dia(s) restantes</p>
              <p className="text-muted-foreground">
                Plano <strong className="text-foreground">{ctx.workspace.planTier}</strong>
              </p>
            </div>
          ) : null}
          <div>
            <p className="font-medium leading-tight">{ctx.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{ctx.user.email}</p>
          </div>
          <Button size="sm" variant="outline" className="w-full" asChild>
            <Link href="/logout">
              <LogOut className="h-4 w-4" /> Sair
            </Link>
          </Button>
        </div>
      </aside>

      <main className="bg-background min-h-screen">
        <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <Badge variant="muted">{ctx.workspace.segment.replace("_", " ")}</Badge>
              <p className="text-sm text-muted-foreground">
                LGPD ativo · auditoria habilitada · multi-tenant
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/app/luma">
                  <Sparkles className="h-4 w-4" /> LUMA
                </Link>
              </Button>
            </div>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
