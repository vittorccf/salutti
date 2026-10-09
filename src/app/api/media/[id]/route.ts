import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLINICAL_MEDIA, media, type MediaKind } from "@/lib/providers/media";
import { canManagePayables, canSeeClinical } from "@/lib/permissions";
import { effectiveAppPermissions } from "@/lib/app-permissions";

// Imagens só para quem tem acesso: foto de perfil para quem divide um consultório com o dono da foto;
// banner e foto de paciente para os membros do consultório. Sem acesso = 404 (não revela que existe).
export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const file = await media.read(params.id);
  if (!file) return new NextResponse(null, { status: 404 });

  const memberships = (
    await db.membership.findMany({ where: { userId: session.userId }, select: { workspaceId: true, role: true, permsGranted: true, permsDenied: true } })
  ).map((m) => ({ ...m, permissions: effectiveAppPermissions(m.role, m.permsGranted, m.permsDenied) }));
  const mine = memberships.map((m) => m.workspaceId);
  let allowed = false;
  if (file.kind === "user_avatar" && file.userId) {
    allowed =
      file.userId === session.userId ||
      (await db.membership.count({ where: { userId: file.userId, workspaceId: { in: mine } } })) > 0;
  } else if (CLINICAL_MEDIA.includes(file.kind as MediaKind) && file.workspaceId) {
    // Foto clínica é dado de saúde: só papéis clínicos do consultório (recepção e financeiro não).
    allowed = memberships.some((m) => m.workspaceId === file.workspaceId && canSeeClinical(m));
  } else if (file.kind === "payable_attachment" && file.workspaceId) {
    allowed = memberships.some((m) => m.workspaceId === file.workspaceId && canManagePayables(m));
  } else if (file.workspaceId) {
    allowed = mine.includes(file.workspaceId);
  }
  if (!allowed) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      // Foto de paciente não fica no cache do navegador (computador compartilhado, anonimização, saída da equipe).
      "cache-control": file.kind === "patient_photo" || CLINICAL_MEDIA.includes(file.kind as MediaKind) ? "private, no-store" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
      // PDF baixa em vez de abrir: o leitor de PDF do navegador não roda com a CSP sandbox abaixo.
      ...(file.mime === "application/pdf" ? { "content-disposition": "attachment" } : {}),
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
};
