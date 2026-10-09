import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { anonymizeExpired } from "@/app/app/lista-espera/_lib";

export const dynamic = "force-dynamic";

// Cron diário da Vercel (vercel.json): anonimiza quem saiu da lista há mais de 6 meses em todos os consultórios,
// mesmo os que não abrem a página. A Vercel manda "Authorization: Bearer $CRON_SECRET"; sem o segredo, nada roda.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await anonymizeExpired();
  return NextResponse.json({ ok: true });
}
