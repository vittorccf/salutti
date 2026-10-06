import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { lookupCep } from "@/lib/cep";

// Só para quem está logado: evita que a rota vire um proxy público de consulta de CEP.
export const GET = async (_req: Request, { params }: { params: { cep: string } }) => {
  if (!(await getSession())) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const result = await lookupCep(params.cep);
  if (result === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (result === "indisponivel") return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(result, { headers: { "cache-control": "private, max-age=86400" } });
};
