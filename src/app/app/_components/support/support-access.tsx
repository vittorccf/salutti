import { ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { TZ } from "@/lib/dates";
import { getLocale, getTranslations } from "@/i18n/server";
import { Button } from "@/components/ui/button";

const timeFormat = async (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(await getLocale(), { ...opts, timeZone: TZ });

// Faixa fixa durante o acesso do "Suporte Salutti": deixa claro onde se está, o que pode e quando termina.
export async function SupportAccessBanner({ workspace, expiresAt }: { workspace: string; expiresAt: Date }) {
  const t = await getTranslations("support.access");
  const time = (await timeFormat({ timeStyle: "short" })).format(expiresAt);
  return (
    <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-warning px-4 py-2 text-sm text-foreground md:px-6">
      <p className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
        {t("banner", { workspace, time })}
      </p>
      <form action="/logout" method="post">
        <Button type="submit" size="sm" variant="outline" className="bg-background">
          {t("leave")}
        </Button>
      </form>
    </div>
  );
}

const NOTICE_DAYS = 30;

// Aviso ao dono e aos administradores: acessos do suporte nos últimos 30 dias (transparência; o registro completo fica na LGPD).
export async function SupportAccessNotice({ workspaceId }: { workspaceId: string }) {
  const grants = await db.supportAccessGrant.findMany({
    where: { workspaceId, usedAt: { gte: new Date(Date.now() - NOTICE_DAYS * 24 * 60 * 60 * 1000) } },
    orderBy: { usedAt: "desc" },
    take: 5,
    select: { id: true, usedAt: true, reason: true },
  });
  if (grants.length === 0) return null;
  const t = await getTranslations("support.access");
  const when = await timeFormat({ dateStyle: "short", timeStyle: "short" });
  return (
    <section className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" aria-labelledby="support-access-notice">
      <h2 id="support-access-notice" className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="h-4 w-4 text-warning-strong" aria-hidden />
        {t("noticeTitle")}
      </h2>
      <ul className="mt-2 space-y-1">
        {grants.map((g) => (
          <li key={g.id}>{t("noticeItem", { date: when.format(g.usedAt!), reason: g.reason })}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{t("noticeHelp")}</p>
    </section>
  );
}
