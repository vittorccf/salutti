import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/providers/media";

// Imagens só para quem tem acesso: foto de perfil para quem divide um consultório com o dono da foto;
// banner e foto de paciente para os membros do consultório. Sem acesso = 404 (não revela que existe).
export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });
  const file = await media.read(params.id);
  if (!file) return new NextResponse(null, { status: 404 });

  const memberships = await db.membership.findMany({ where: { userId: session.userId }, select: { workspaceId: true } });
  const mine = memberships.map((m) => m.workspaceId);
  let allowed = false;
  if (file.kind === "user_avatar" && file.userId) {
    allowed =
      file.userId === session.userId ||
      (await db.membership.count({ where: { userId: file.userId, workspaceId: { in: mine } } })) > 0;
  } else if (file.workspaceId) {
    allowed = mine.includes(file.workspaceId);
  }
  if (!allowed) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mime,
      "content-length": String(file.size),
      // Foto de paciente não fica no cache do navegador (computador compartilhado, anonimização, saída da equipe).
      "cache-control": file.kind === "patient_photo" ? "private, no-store" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
};
