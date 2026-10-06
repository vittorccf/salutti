"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  FileSignature,
  LayoutDashboard,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  UserSquare2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export const SidebarNav = () => {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent font-medium text-accent-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-accent-foreground" : "text-muted-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
