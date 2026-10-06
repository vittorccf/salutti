"use client";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Avatar src={avatarUrl} name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[--radix-dropdown-menu-trigger-width]">
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
          <Link href="/app/conta/seguranca">
            <ShieldCheck /> {t("security")}
          </Link>
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
