import Link from "next/link";
import { addDays } from "date-fns";
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

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const ctx = await requireContext();
  const t = await getTranslations("schedule.week");
  const tc = await getTranslations("common");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const params = await searchParams;
  // ?week=AAAA-MM-DD (dia em São Paulo); semana de segunda a domingo no calendário de São Paulo.
  const refDate = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? parseDateOnly(params.week) : new Date();
  const weekStart = inSP(startOfWeekSP(refDate));
  const weekEnd = addDays(weekStart, 7);

  const appointments = await db.appointment.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      startsAt: { gte: new Date(weekStart.getTime()), lt: new Date(weekEnd.getTime()) },
    },
    include: { patient: true, professional: true },
    orderBy: { startsAt: "asc" },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const prevWeek = dateKeySP(addDays(weekStart, -7));
  const nextWeek = dateKeySP(addDays(weekStart, 7));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("weekOf", { date: weekOfLabel(f.locale, weekStart) })} ·{" "}
            {tc("count.sessions", { count: appointments.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/app/agenda?week=${prevWeek}`}>
              <ChevronLeft className="h-4 w-4" /> {t("previous")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/app/agenda?week=${nextWeek}`}>
              {t("next")} <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/agenda/novo">
              <CalendarPlus className="h-4 w-4" /> {t("newSession")}
            </Link>
          </Button>
        </div>
      </header>

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
    </div>
  );
}

// "Segunda, 05" / "Monday, 05": dia da semana no idioma da interface, sem o "-feira" e com a primeira letra maiúscula.
const dayLabel = (locale: string, day: Date) => {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: TZ }).format(day).split("-")[0];
  return {
    weekday: `${weekday.charAt(0).toLocaleUpperCase(locale)}${weekday.slice(1)}`,
    day: new Intl.DateTimeFormat(locale, { day: "2-digit", timeZone: TZ }).format(day),
  };
};

// "09 de novembro" / "November 09".
const weekOfLabel = (locale: string, day: Date) =>
  new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", timeZone: TZ }).format(day);
