import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-auth";
import { safeUrl, sessionIcs } from "@/lib/portal";
import { getTranslations } from "@/i18n/server";

// Sessão do paciente em .ics para adicionar à agenda do celular (só a dele).
export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
  const access = await getPortalSession();
  if (!access) return new NextResponse(null, { status: 401 });
  const a = await db.appointment.findFirst({ where: { id: params.id, patientId: access.patientId, workspaceId: access.patient.workspaceId } });
  if (!a) return new NextResponse(null, { status: 404 });
  const t = await getTranslations("portal.week");
  const ics = sessionIcs({
    id: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    title: t("icsTitle", { workspace: access.patient.workspace.name }),
    location: a.modality === "online" ? null : access.patient.workspace.name,
    url: safeUrl(a.meetingUrl),
  });
  return new NextResponse(ics, {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="sessao.ics"', "cache-control": "private, no-store" },
  });
};
