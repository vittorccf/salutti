import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/totp";
import { exchangeCode, GoogleScopeError, OAUTH_COOKIE, googleRedirectUri } from "@/lib/providers/google-oauth";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Retorno do Google: confere state (CSRF) e se é o mesmo usuário que começou; troca o código e guarda o
// refresh token cifrado. Resultado volta para Ajustes como ?google=ok|negado|escopo|erro.
export const GET = async (req: NextRequest) => {
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(`/app/ajustes?google=${status}#conexoes`, req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/integracoes/google" });
    return res;
  };
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  let saved: { state: string; verifier: string; userId: string } | null = null;
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "null");
  } catch {
    saved = null;
  }
  const params = req.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  if (!saved || !state || !same(state, saved.state) || saved.userId !== session.userId) return back("erro");
  if (params.get("error")) return back("negado");
  const code = params.get("code");
  if (!code) return back("erro");

  try {
    const redirectUri = googleRedirectUri(req.url);
    const result = await exchangeCode({ code, redirectUri, verifier: saved.verifier });
    await db.integrationConnection.upsert({
      where: { userId_provider: { userId: session.userId, provider: "google" } },
      create: {
        userId: session.userId,
        provider: "google",
        accountEmail: result.email,
        scopes: result.scopes,
        refreshToken: encryptSecret(result.refreshToken),
      },
      update: { accountEmail: result.email, scopes: result.scopes, refreshToken: encryptSecret(result.refreshToken) },
    });
    const memberships = await db.membership.findMany({ where: { userId: session.userId }, select: { workspaceId: true } });
    for (const m of memberships) {
      await recordAudit({ workspaceId: m.workspaceId, userId: session.userId, action: "integration.google.connect", entity: "User", entityId: session.userId });
    }
    return back("ok");
  } catch (e) {
    if (e instanceof GoogleScopeError) return back("escopo");
    console.error("[google] falha ao conectar", e);
    return back("erro");
  }
};
