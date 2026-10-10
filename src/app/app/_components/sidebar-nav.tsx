"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Handshake,
  Hourglass,
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  Package,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AREAS, type Module } from "@/lib/areas";
import { SALUTTIN_ENABLED } from "@/lib/features";

// `module`: item que só aparece quando o módulo está ligado na área do consultório (src/lib/areas.ts).
const nav: { href: string; label: string; icon: typeof Users; module?: Module; perm?: string }[] = [
  { href: "/app", label: "dashboard", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "patients", icon: Users },
  { href: "/app/agenda", label: "schedule", icon: CalendarDays },
  { href: "/app/lista-espera", label: "waitlist", icon: Hourglass, module: "lista_espera", perm: "pacientes.gerenciar" },
  { href: "/app/procedimentos", label: "procedures", icon: Syringe, module: "procedimentos" },
  { href: "/app/estoque", label: "stock", icon: Package, module: "estoque" },
  { href: "/app/prontuario", label: "records", icon: ClipboardList, module: "prontuario" },
  { href: "/app/portal", label: "portal", icon: MessagesSquare, module: "portal", perm: "clinico.ver" },
  { href: "/app/financeiro", label: "finance", icon: Banknote, perm: "financeiro.receber" },
  { href: "/app/convenios", label: "insurance", icon: Handshake, module: "convenios" },
  { href: "/app/fiscal", label: "tax", icon: FileSignature, perm: "fiscal.ver" },
  ...(SALUTTIN_ENABLED ? [{ href: "/app/saluttin", label: "saluttin", icon: Sparkles }] : []),
  { href: "/app/comunicacao", label: "communication", icon: MessageSquareText },
  { href: "/app/equipe", label: "team", icon: Stethoscope },
  { href: "/app/lgpd", label: "lgpd", icon: ShieldCheck, perm: "lgpd.gerenciar" },
];

// `modules`: módulos ligados na área do consultório ativo. Sem a lista, vale o menu da Salutti.
const MENTAL_MODULES = (Object.keys(AREAS.mental.modules) as Module[]).filter((m) => AREAS.mental.modules[m]);

// `portalPending`: mensagens não lidas e pedidos de remarcação do portal do paciente (badge no item).
// `waitlistUrgent`: inscrições da lista de espera marcadas como urgentes e ainda sem contato.
// `perms`: permissões do membro (sem a lista, mostra tudo o que o módulo permite).
export const SidebarNav = ({
  clinical = true,
  modules = MENTAL_MODULES,
  portalPending = 0,
  waitlistUrgent = 0,
  perms,
}: {
  clinical?: boolean;
  modules?: Module[];
  portalPending?: number;
  waitlistUrgent?: number;
  perms?: string[];
}) => {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  return (
    <nav className="space-y-1">
      {nav
        .filter((item) => !item.module || modules.includes(item.module))
        .filter((item) => !item.perm || !perms || perms.includes(item.perm))
        // Prontuário e portal (mensagens e tarefas do paciente) são conteúdo clínico.
        .filter((item) => clinical || (item.href !== "/app/prontuario" && item.href !== "/app/portal"))
        .map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // Item ativo: fundo accent, texto e ícone na cor de identidade (brand).
              active && "bg-accent font-medium text-brand hover:text-brand",
            )}
          >
            <Icon className={cn("h-5 w-5 shrink-0", active ? "text-brand" : "text-muted-foreground")} />
            {t(item.label)}
            {item.href === "/app/portal" && portalPending > 0 ? (
              <span className="ml-auto rounded-full bg-highlight px-2 py-0.5 text-xs font-semibold tabular-nums text-highlight-foreground">
                <span className="sr-only">{t("portalPending", { count: portalPending })}</span>
                <span aria-hidden>{portalPending > 99 ? "99+" : portalPending}</span>
              </span>
            ) : null}
            {item.href === "/app/lista-espera" && waitlistUrgent > 0 ? (
              <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold tabular-nums text-destructive-foreground">
                <span className="sr-only">{t("waitlistUrgent", { count: waitlistUrgent })}</span>
                <span aria-hidden>{waitlistUrgent > 99 ? "99+" : waitlistUrgent}</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
};
