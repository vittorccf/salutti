import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { tissXmlBytes } from "@/lib/tiss";

// Download do XML do lote, em ISO-8859-1 (codificação declarada na mensagem TISS).
export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // O lote leva dados de pacientes (carteirinha, procedimentos): fora do acesso de suporte.
  if (ctx.support) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const batch = await db.tissBatch.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(tissXmlBytes(batch.xml), {
    headers: {
      "content-type": "application/xml; charset=ISO-8859-1",
      "content-disposition": `attachment; filename="lote-tiss-${batch.number}.xml"`,
    },
  });
};
