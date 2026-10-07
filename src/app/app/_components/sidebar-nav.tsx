"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  FileSignature,
  Handshake,
  LayoutDashboard,
  MessageSquareText,
  Package,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { Module } from "@/lib/areas";

// `module`: item que só aparece quando o módulo está ligado na área do consultório (src/lib/areas.ts).
const nav: { href: string; label: string; icon: typeof Users; module?: Module }[] = [
  { href: "/app", label: "dashboard", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "patients", icon: Users },
  { href: "/app/agenda", label: "schedule", icon: CalendarDays },
  { href: "/app/procedimentos", label: "procedures", icon: Syringe, module: "procedimentos" },
  { href: "/app/estoque", label: "stock", icon: Package, module: "estoque" },
  { href: "/app/prontuario", label: "records", icon: ClipboardList, module: "prontuario" },
  { href: "/app/financeiro", label: "finance", icon: Banknote },
  { href: "/app/convenios", label: "insurance", icon: Handshake, module: "convenios" },
  { href: "/app/fiscal", label: "tax", icon: FileSignature },
  { href: "/app/saluttin", label: "saluttin", icon: Sparkles },
  { href: "/app/comunicacao", label: "communication", icon: MessageSquareText },
  { href: "/app/equipe", label: "team", icon: Stethoscope },
  { href: "/app/lgpd", label: "lgpd", icon: ShieldCheck },
];

// `modules`: módulos ligados na área do consultório ativo. Sem a lista, vale o menu da Salutti.
const MENTAL_MODULES: Module[] = ["convenios", "prontuario"];

export const SidebarNav = ({ clinical = true, modules = MENTAL_MODULES }: { clinical?: boolean; modules?: Module[] }) => {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  return (
    <nav className="space-y-1">
      {nav
        .filter((item) => !item.module || modules.includes(item.module))
        .filter((item) => clinical || item.href !== "/app/prontuario")
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
          </Link>
        );
      })}
    </nav>
  );
};
