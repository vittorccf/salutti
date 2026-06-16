import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const GET = async (req: Request) => {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const url = new URL(req.url);
  const patientId = url.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "missing patientId" }, { status: 400 });

  const patient = await db.patient.findFirst({
    where: { id: patientId, workspaceId: ctx.workspace.id },
    include: {
      appointments: true,
      clinicalNotes: true,
      charges: true,
      receipts: true,
      invoices: true,
      consentRecords: true,
      dailyCards: true,
    },
  });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const filename = `saluti-portabilidade-${patient.fullName.replaceAll(" ", "_")}.json`;
  return new NextResponse(JSON.stringify(patient, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};
