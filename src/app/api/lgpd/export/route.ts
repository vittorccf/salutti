import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/providers/media";

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

  const photoFile = patient.photoId ? await media.read(patient.photoId) : null;
  const photo = photoFile ? { mime: photoFile.mime, dataUrl: `data:${photoFile.mime};base64,${Buffer.from(photoFile.bytes).toString("base64")}` } : null;
  const filename = `salutti-portabilidade-${patient.fullName.replaceAll(" ", "_")}.json`;
  return new NextResponse(JSON.stringify({ ...patient, photo }, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};
