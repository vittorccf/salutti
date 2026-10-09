"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Gauge, History, LayoutDashboard, LifeBuoy, ShieldCheck, Store, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Cada item aparece só para quem tem a permissão (src/lib/backoffice/permissions.ts).
const items = [
  { href: "/backoffice", label: "Visão geral", icon: LayoutDashboard, perm: null },
  { href: "/backoffice/chamados", label: "Chamados", icon: LifeBuoy, badge: "tickets", perm: "chamados.ver" },
  { href: "/backoffice/clientes", label: "Clientes", icon: Store, perm: "clientes.ver" },
  { href: "/backoffice/usuarios", label: "Usuários", icon: Users, perm: "clientes.ver" },
  { href: "/backoffice/planos", label: "Planos", icon: CreditCard, perm: "planos.ver" },
  { href: "/backoffice/equipe", label: "Equipe e permissões", icon: ShieldCheck, perm: "equipe.gerenciar" },
  { href: "/backoffice/recursos", label: "Gestão de Recursos", icon: Gauge, perm: "recursos.ver" },
  { href: "/backoffice/auditoria", label: "Auditoria", icon: History, perm: "auditoria.ver" },
] as const;

export function BackofficeNav({ perms, unreadTickets }: { perms: string[]; unreadTickets: number }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1" aria-label="Backoffice">
      {items
        .filter((item) => item.perm === null || perms.includes(item.perm))
        .map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/backoffice" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "bg-accent font-medium text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && unreadTickets > 0 ? (
                <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
                  {unreadTickets}
                  <span className="sr-only"> com mensagem nova</span>
                </span>
              ) : null}
            </Link>
          );
        })}
    </nav>
  );
}
