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
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app", label: "dashboard", icon: LayoutDashboard },
  { href: "/app/pacientes", label: "patients", icon: Users },
  { href: "/app/agenda", label: "schedule", icon: CalendarDays },
  { href: "/app/prontuario", label: "records", icon: ClipboardList },
  { href: "/app/financeiro", label: "finance", icon: Banknote },
  { href: "/app/convenios", label: "insurance", icon: Handshake },
  { href: "/app/fiscal", label: "tax", icon: FileSignature },
  { href: "/app/saluttin", label: "saluttin", icon: Sparkles },
  { href: "/app/comunicacao", label: "communication", icon: MessageSquareText },
  { href: "/app/equipe", label: "team", icon: Stethoscope },
  { href: "/app/lgpd", label: "lgpd", icon: ShieldCheck },
] as const;

export const SidebarNav = ({ clinical = true }: { clinical?: boolean }) => {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  return (
    <nav className="space-y-1">
      {nav.filter((item) => clinical || item.href !== "/app/prontuario").map((item) => {
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
