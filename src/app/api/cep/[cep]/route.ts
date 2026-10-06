import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { lookupCep, normalizeCep, type CepAddress } from "@/lib/cep";

// Só para quem está logado: evita que a rota vire um proxy público de consulta de CEP.
// Cache por CEP e limite por usuário: um loop de chamadas não pode fazer o ViaCEP bloquear o IP da Vercel
// (o que derrubaria a busca para todos os consultórios). Os dois vivem na memória da instância: bastam
// contra abuso casual, sem depender de outro serviço.
const DAY = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: CepAddress | null }>();
const hits = new Map<string, number[]>();
const LIMIT = 30; // consultas por minuto, por usuário

function allowed(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length <= LIMIT;
}

export const GET = async (_req: Request, { params }: { params: { cep: string } }) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const cep = normalizeCep(params.cep);

  let hit = cache.get(cep);
  if (hit && Date.now() - hit.at > DAY) {
    cache.delete(cep);
    hit = undefined;
  }
  if (!hit) {
    if (!allowed(session.userId)) return NextResponse.json({ error: "rate limited" }, { status: 429 });
    const result = await lookupCep(cep);
    if (result === "indisponivel") return NextResponse.json({ error: "unavailable" }, { status: 503 });
    hit = { at: Date.now(), value: result };
    if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    cache.set(cep, hit);
  }
  if (!hit.value) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(hit.value, { headers: { "cache-control": "private, max-age=86400" } });
};
