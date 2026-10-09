import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/providers/media";
import { canSeeClinical, can } from "@/lib/permissions";

// Margem para o JSON dos demais dados dentro dos 4,5 MB de resposta de uma função da Vercel.
const IMAGE_BUDGET = 3_500_000;

export const GET = async (req: Request) => {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // A exportação leva prontuário e fotos clínicas (dados de saúde): só papéis clínicos.
  if (!canSeeClinical(ctx) || !can(ctx, "lgpd.gerenciar") || ctx.support) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
      // Portal do paciente: mensagens, destaques e o acesso (sem o hash da senha nem o token).
      portalMessages: { orderBy: { createdAt: "asc" } },
      portalHighlights: true,
      portalAccess: { select: { cpfDigits: true, activatedAt: true, lastLoginAt: true, messagesEnabled: true, active: true } },
    },
  });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const photoFile = patient.photoId ? await media.read(patient.photoId) : null;
  const photo = photoFile ? { mime: photoFile.mime, dataUrl: `data:${photoFile.mime};base64,${Buffer.from(photoFile.bytes).toString("base64")}` } : null;
  // Fotos clínicas e assinaturas (Salutti Estética) também são dados da pessoa: vão com a imagem enquanto o
  // arquivo couber no limite de resposta da Vercel (4,5 MB). O que passar fica listado com o id, para baixar à parte.
  let budget = IMAGE_BUDGET - (photo?.dataUrl.length ?? 0);
  const embed = async (mediaId: string) => {
    const file = await media.read(mediaId);
    if (!file) return { dataUrl: null, omitted: false };
    const dataUrl = `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}`;
    if (dataUrl.length > budget) return { dataUrl: null, omitted: true };
    budget -= dataUrl.length;
    return { dataUrl, omitted: false };
  };
  const clinicalPhotos = [];
  for (const cp of await db.clinicalPhoto.findMany({ where: { workspaceId: ctx.workspace.id, patientId: patient.id }, orderBy: { takenAt: "asc" } })) {
    clinicalPhotos.push({ ...cp, ...(await embed(cp.mediaId)) });
  }
  const signatures = [];
  for (const c of patient.consentRecords.filter((c) => c.signatureId)) {
    signatures.push({ consentRecordId: c.id, mediaId: c.signatureId, ...(await embed(c.signatureId!)) });
  }
  const omitted = [...clinicalPhotos, ...signatures].filter((x) => x.omitted).length;
  const filename = `salutti-portabilidade-${patient.fullName.replaceAll(" ", "_")}.json`;
  return new NextResponse(JSON.stringify(
      {
        ...patient,
        photo,
        clinicalPhotos,
        signatures,
        ...(omitted ? { note: `${omitted} imagem(ns) acima do limite do arquivo: peça a exportação das imagens ao consultório.` } : {}),
      },
      null,
      2,
    ), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};
