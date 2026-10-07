import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/providers/media";
import { canSeeClinical } from "@/lib/permissions";

export const GET = async (req: Request) => {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // A exportação leva prontuário e fotos clínicas (dados de saúde): só papéis clínicos.
  if (!canSeeClinical(ctx.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
  // Fotos clínicas (Salutti Estética) também são dados da pessoa: vão na exportação com a imagem.
  const clinicalPhotos = await Promise.all(
    (await db.clinicalPhoto.findMany({ where: { workspaceId: ctx.workspace.id, patientId: patient.id } })).map(async (cp) => {
      const file = await media.read(cp.mediaId);
      return { ...cp, dataUrl: file ? `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}` : null };
    }),
  );
  const filename = `salutti-portabilidade-${patient.fullName.replaceAll(" ", "_")}.json`;
  return new NextResponse(JSON.stringify({ ...patient, photo, clinicalPhotos }, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};
