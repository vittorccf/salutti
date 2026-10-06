"use client";
import { supportMailto } from "@/lib/contact";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ChevronDown, LifeBuoy, LogOut, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = { name: string; email: string; avatarUrl?: string | null };

export const UserMenu = ({ name, email, avatarUrl }: Props) => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const t = useTranslations("common.userMenu");
  const tNav = useTranslations("common.nav");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("open", { name })}
        className="flex max-w-[14rem] items-center gap-2 rounded-full p-0.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:rounded-md md:py-1 md:pl-1 md:pr-2"
      >
        <Avatar src={avatarUrl} name={name} className="h-8 w-8" />
        <span className="hidden min-w-0 truncate text-sm font-medium md:block">{name}</span>
        <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun /> : <Moon />}
          {isDark ? t("lightTheme") : t("darkTheme")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/ajustes">
            <Settings /> {tNav("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/conta/seguranca">
            <ShieldCheck /> {t("security")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={supportMailto("Suporte Salutti")}>
            <LifeBuoy /> {t("support")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/logout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit">
              <LogOut /> {t("logout")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
