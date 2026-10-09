import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { db } from "@/lib/db";
import { requireClinicalContext } from "@/lib/permissions";
import { portalPatientScope } from "@/lib/portal";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearResponseAction, saveNoticeAction } from "./_actions";

export const dynamic = "force-dynamic";

// Caixa de entrada do portal: conversas (não lidas primeiro), pedidos de remarcação e o aviso de horário de resposta.
export default async function PortalInboxPage() {
  const ctx = await requireClinicalContext();
  const wsId = ctx.workspace.id;
  const [t, f] = await Promise.all([getTranslations("portal.pro.inbox"), getFormat()]);
  const scope = portalPatientScope(ctx);
  const [threads, unread, requests, active, legacy] = await Promise.all([
    db.portalMessage.groupBy({ by: ["patientId"], where: { workspaceId: wsId, patient: scope }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 50 }),
    db.portalMessage.groupBy({ by: ["patientId"], where: { workspaceId: wsId, fromPatient: true, readAt: null, patient: scope }, _count: { _all: true } }),
    db.appointment.findMany({
      where: { workspaceId: wsId, patientResponse: "reschedule", startsAt: { gte: new Date() }, status: { not: "cancelled" }, patient: scope },
      include: { patient: { select: { id: true, fullName: true } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
    db.patientPortalAccess.count({ where: { active: true, activatedAt: { not: null }, patient: { workspaceId: wsId, deletedAt: null, ...scope } } }),
    // Link antigo (de antes da senha), ainda sem senha criada: o paciente precisa de um convite novo.
    db.patientPortalAccess.findMany({
      where: { active: true, activatedAt: null, inviteTokenHash: null, patient: { workspaceId: wsId, deletedAt: null, ...scope } },
      include: { patient: { select: { id: true, fullName: true } } },
      take: 50,
    }),
  ]);
  const patients = await db.patient.findMany({ where: { id: { in: threads.map((x) => x.patientId) }, workspaceId: wsId }, select: { id: true, fullName: true } });
  const unreadOf = (id: string) => unread.find((u) => u.patientId === id)?._count._all ?? 0;
  const rows = threads
    .map((th) => ({ patient: patients.find((p) => p.id === th.patientId), last: th._max.createdAt, unread: unreadOf(th.patientId) }))
    .filter((r) => r.patient)
    .sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <MessagesSquare className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description", { count: active })}</p>
      </header>

      {legacy.length ? (
        <Card className="border-brand/40">
          <CardHeader>
            <CardTitle>{t("legacyTitle", { count: legacy.length })}</CardTitle>
            <CardDescription>{t("legacyDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2 text-sm">
              {legacy.map((l) => (
                <li key={l.id}>
                  <Link href={`/app/pacientes/${l.patient.id}/portal`} className="inline-flex rounded-full border px-3 py-1 text-brand hover:bg-accent">
                    {l.patient.fullName}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {requests.length ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>{t("requestsTitle")}</CardTitle>
            <CardDescription>{t("requestsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {requests.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                  <span>
                    <Link href={`/app/pacientes/${a.patient.id}/portal`} className="font-medium text-brand underline-offset-4 hover:underline">
                      {a.patient.fullName}
                    </Link>{" "}
                    · <Link href={`/app/agenda/${a.id}`} className="underline-offset-4 hover:underline">{f.dateTime(a.startsAt)}</Link>
                    {a.patientResponseNote ? <span className="block text-muted-foreground">“{a.patientResponseNote}”</span> : null}
                  </span>
                  <ActionForm action={clearResponseAction}>
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <Button type="submit" variant="outline" size="sm">
                      {t("handled")}
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("conversations")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.patient!.id}>
                  <Link href={`/app/pacientes/${r.patient!.id}/portal`} className="flex items-center justify-between gap-3 px-6 py-3 text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className={r.unread ? "font-semibold" : ""}>{r.patient!.fullName}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {r.last ? f.dateTime(r.last) : null}
                      {r.unread ? <Badge variant="highlight">{t("unread", { count: r.unread })}</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ctx.role === "owner" || ctx.role === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("noticeTitle")}</CardTitle>
            <CardDescription>{t("noticeDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveNoticeAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="notice">{t("notice")}</Label>
                <Input id="notice" name="notice" maxLength={200} defaultValue={ctx.workspace.portalMessageNotice ?? ""} placeholder={t("noticePlaceholder")} />
              </div>
              <Button type="submit" variant="outline">
                {t("save")}
              </Button>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
