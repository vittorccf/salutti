import Link from "next/link";
import { getTranslations } from "@/i18n/server";
import { canManagePayables } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Abas do financeiro: receber (cobranças), pagar e relatórios. Pagar e relatórios mostram o custo do consultório:
// só dono, administrador e financeiro.
export async function FinanceTabs({ role, active }: { role: string; active: "receivables" | "payables" | "reports" }) {
  if (!canManagePayables(role)) return null;
  const t = await getTranslations("payables.tabs");
  const tabs = [
    { key: "receivables", href: "/app/financeiro" },
    { key: "payables", href: "/app/financeiro/pagar" },
    { key: "reports", href: "/app/financeiro/relatorios" },
  ] as const;
  return (
    <nav aria-label={t("label")} className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
