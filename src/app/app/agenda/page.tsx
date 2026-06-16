import Link from "next/link";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, Video } from "lucide-react";
import { formatTimeBR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const refDate = params.week ? new Date(params.week) : new Date();
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

  const appointments = await db.appointment.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      startsAt: { gte: weekStart, lt: weekEnd },
    },
    include: { patient: true, professional: true },
    orderBy: { startsAt: "asc" },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const prevWeek = addDays(weekStart, -7).toISOString();
  const nextWeek = addDays(weekStart, 7).toISOString();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Semana de {format(weekStart, "dd 'de' MMMM", { locale: ptBR })} ·{" "}
            {appointments.length} sessão(ões)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/app/agenda?week=${prevWeek}`}>← Semana anterior</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/app/agenda?week=${nextWeek}`}>Próxima →</Link>
          </Button>
          <Button asChild>
            <Link href="/app/agenda/novo">
              <CalendarPlus className="h-4 w-4" /> Nova sessão
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => {
          const dayAppointments = appointments.filter((a) => isSameDay(a.startsAt, day));
          const isToday = isSameDay(day, new Date());
          return (
            <Card key={day.toISOString()} className={isToday ? "border-primary/40" : ""}>
              <CardHeader className="p-3">
                <CardTitle className="text-sm flex justify-between">
                  <span>{format(day, "EEE dd", { locale: ptBR })}</span>
                  {isToday ? <Badge variant="default">hoje</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                {dayAppointments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem sessões</p>
                ) : (
                  dayAppointments.map((a) => (
                    <Link
                      key={a.id}
                      href={`/app/agenda/${a.id}`}
                      className="block rounded-md border bg-card p-2 text-xs hover:border-primary"
                    >
                      <p className="font-semibold">{formatTimeBR(a.startsAt)}</p>
                      <p className="truncate">{a.patient.fullName}</p>
                      <p className="text-muted-foreground truncate">{a.professional.fullName}</p>
                      <div className="mt-1 flex justify-between items-center">
                        <Badge
                          variant={
                            a.status === "confirmed" ? "success" : a.status === "no_show" ? "destructive" : "muted"
                          }
                        >
                          {a.status}
                        </Badge>
                        {a.modality === "online" ? <Video className="h-3 w-3 text-primary" /> : null}
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
