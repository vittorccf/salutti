import Link from "next/link";
import { addDays, addMonths, endOfMonth } from "date-fns";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarPlus, ChevronLeft, ChevronRight, Video } from "lucide-react";
import { dateKeySP, inSP, isSameDaySP, parseDateOnly, startOfWeekSP, TZ } from "@/lib/dates";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Sessões mostradas por dia na visão mensal; o resto vira "+N" (leva à semana daquele dia).
const MONTH_PER_DAY = 3;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; month?: string }>;
}) {
  const ctx = await requireContext();
  const t = await getTranslations("schedule.week");
  const tc = await getTranslations("common");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const params = await searchParams;
  const monthView = params.view === "month";

  // Semana: ?week=AAAA-MM-DD (segunda a domingo no calendário de São Paulo).
  // Mês: ?view=month&month=AAAA-MM; a grade começa na segunda da semana do dia 1 e vai até o domingo após o fim do mês.
  const refDate = monthView
    ? params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? parseDateOnly(`${params.month}-01`)
      : parseDateOnly(`${dateKeySP().slice(0, 7)}-01`)
    : params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
      ? parseDateOnly(params.week)
      : new Date();
  const monthStart = inSP(refDate);
  const rangeStart = inSP(startOfWeekSP(refDate));
  const rangeEnd = monthView
    ? addDays(inSP(startOfWeekSP(endOfMonth(monthStart))), 7)
    : addDays(rangeStart, 7);

  const appointments = await db.appointment.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      startsAt: { gte: new Date(rangeStart.getTime()), lt: new Date(rangeEnd.getTime()) },
    },
    include: { patient: true, professional: true },
    orderBy: { startsAt: "asc" },
  });

  const dayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000);
  const days = Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i));
  const monthKey = dateKeySP(monthStart).slice(0, 7);
  const prevHref = monthView
    ? `/app/agenda?view=month&month=${dateKeySP(addMonths(monthStart, -1)).slice(0, 7)}`
    : `/app/agenda?week=${dateKeySP(addDays(rangeStart, -7))}`;
  const nextHref = monthView
    ? `/app/agenda?view=month&month=${dateKeySP(addMonths(monthStart, 1)).slice(0, 7)}`
    : `/app/agenda?week=${dateKeySP(addDays(rangeStart, 7))}`;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {monthView ? capitalize(f.locale, f.monthYear(monthStart)) : t("weekOf", { date: weekOfLabel(f.locale, rangeStart) })} ·{" "}
            {tc("count.sessions", { count: appointments.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Semana | Mês */}
          <nav aria-label={t("viewLabel")} className="inline-flex rounded-md border p-0.5">
            <Link
              href={`/app/agenda?week=${dateKeySP(monthView ? monthStart : rangeStart)}`}
              aria-current={!monthView ? "page" : undefined}
              className={cn(
                "rounded-[8px] px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !monthView ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("viewWeek")}
            </Link>
            <Link
              href={`/app/agenda?view=month&month=${monthView ? monthKey : dateKeySP(rangeStart).slice(0, 7)}`}
              aria-current={monthView ? "page" : undefined}
              className={cn(
                "rounded-[8px] px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                monthView ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("viewMonth")}
            </Link>
          </nav>
          <Button variant="outline" asChild>
            <Link href={prevHref}>
              <ChevronLeft className="h-4 w-4" aria-hidden /> {monthView ? t("previousMonth") : t("previous")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={nextHref}>
              {monthView ? t("nextMonth") : t("next")} <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/agenda/novo">
              <CalendarPlus className="h-4 w-4" aria-hidden /> {t("newSession")}
            </Link>
          </Button>
        </div>
      </header>

      {monthView ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b">
            {days.slice(0, 7).map((d) => (
              <div key={d.toISOString()} className="px-2 py-2 text-overline text-muted-foreground">
                {weekdayShort(f.locale, d)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const inMonth = dateKeySP(day).slice(0, 7) === monthKey;
              const isToday = isSameDaySP(day, new Date());
              const dayAppointments = appointments.filter((a) => isSameDaySP(a.startsAt, day));
              const extra = dayAppointments.length - MONTH_PER_DAY;
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-24 space-y-1 border-b border-r p-1.5 sm:min-h-28 sm:p-2",
                    (i + 1) % 7 === 0 && "border-r-0",
                    !inMonth && "bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/app/agenda?week=${dateKeySP(day)}`}
                      aria-label={t("openWeekOf", { date: f.date(day) })}
                      className={cn(
                        "grid h-6 min-w-6 place-content-center rounded-full px-1 text-xs tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isToday ? "bg-brand font-semibold text-brand-foreground hover:bg-brand" : inMonth ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {new Intl.DateTimeFormat(f.locale, { day: "numeric", timeZone: TZ }).format(day)}
                    </Link>
                    {/* No celular, só a contagem: a célula é estreita demais para nomes. */}
                    {dayAppointments.length > 0 ? (
                      <span className="text-[11px] tabular-nums text-muted-foreground sm:hidden">{dayAppointments.length}</span>
                    ) : null}
                  </div>
                  <div className="hidden space-y-1 sm:block">
                    {dayAppointments.slice(0, MONTH_PER_DAY).map((a) => (
                      <Link
                        key={a.id}
                        href={`/app/agenda/${a.id}`}
                        className={cn(
                          "block truncate rounded-md border border-brand/25 bg-accent/40 px-1.5 py-0.5 text-[11px] leading-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          (a.status === "cancelled" || a.status === "no_show") && "text-muted-foreground line-through",
                        )}
                        title={`${f.time(a.startsAt)} · ${a.patient.fullName} · ${label("modality", a.modality)}`}
                      >
                        <span className="font-semibold tabular-nums">{f.time(a.startsAt)}</span> {firstName(a.patient.fullName)}
                      </Link>
                    ))}
                    {extra > 0 ? (
                      <Link
                        href={`/app/agenda?week=${dateKeySP(day)}`}
                        className="block px-1.5 text-[11px] text-brand hover:underline"
                      >
                        {t("more", { count: extra })}
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map((day) => {
            const dayAppointments = appointments.filter((a) => isSameDaySP(a.startsAt, day));
            const isToday = isSameDaySP(day, new Date());
            return (
              <Card key={day.toISOString()} className={isToday ? "border-brand/40" : ""}>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{t("dayLabel", dayLabel(f.locale, day))}</span>
                    {isToday ? <Badge variant="default">{t("today")}</Badge> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {dayAppointments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("empty")}</p>
                  ) : (
                    dayAppointments.map((a) => (
                      <Link
                        key={a.id}
                        href={`/app/agenda/${a.id}`}
                        className="block rounded-md border border-brand/25 bg-accent/40 p-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <p className="font-semibold tabular-nums">{f.time(a.startsAt)}</p>
                        <p className="truncate">{a.patient.fullName}</p>
                        <p className="text-muted-foreground truncate">{a.professional.fullName}</p>
                        <div className="mt-1 flex justify-between items-center">
                          <StatusBadge kind="appointment" status={a.status} />
                          {a.modality === "online" ? (
                            <Video className="h-3.5 w-3.5 text-brand" aria-label={label("modality", "online")} role="img" />
                          ) : null}
                        </div>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

const capitalize = (locale: string, s: string) => `${s.charAt(0).toLocaleUpperCase(locale)}${s.slice(1)}`;

// Na visão mensal, só o primeiro nome (a grade fica visível na tela; o nome completo está ao abrir a sessão).
const firstName = (name: string) => name.split(" ")[0];

// "Seg", "Ter" / "Mon", "Tue": cabeçalho da grade mensal.
const weekdayShort = (locale: string, day: Date) =>
  capitalize(locale, new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: TZ }).format(day).replace(".", ""));

// "Segunda, 05" / "Monday, 05": dia da semana no idioma da interface, sem o "-feira" e com a primeira letra maiúscula.
const dayLabel = (locale: string, day: Date) => {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: TZ }).format(day).split("-")[0];
  return {
    weekday: capitalize(locale, weekday),
    day: new Intl.DateTimeFormat(locale, { day: "2-digit", timeZone: TZ }).format(day),
  };
};

// "09 de novembro" / "November 09".
const weekOfLabel = (locale: string, day: Date) =>
  new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", timeZone: TZ }).format(day);
