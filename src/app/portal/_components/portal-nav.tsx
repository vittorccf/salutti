"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarHeart, MessagesSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

// Navegação inferior do portal (alvo de toque de 44px+), com o número de mensagens não lidas.
export function PortalNav({ labels, unread }: { labels: { week: string; messages: string; account: string; nav: string; unread: string }; unread: number }) {
  const pathname = usePathname();
  const items = [
    { href: "/portal", label: labels.week, icon: CalendarHeart },
    // Na própria aba de mensagens, a conversa acabou de ser lida: sem contador.
    { href: "/portal/mensagens", label: labels.messages, icon: MessagesSquare, badge: pathname.startsWith("/portal/mensagens") ? 0 : unread },
    { href: "/portal/conta", label: labels.account, icon: UserRound },
  ];
  return (
    <nav aria-label={labels.nav} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {items.map((item) => {
          const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-brand" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-highlight px-1 text-center text-[10px] font-semibold leading-[18px] text-highlight-foreground" aria-hidden>
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
                {item.badge ? <span className="sr-only">{labels.unread}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
