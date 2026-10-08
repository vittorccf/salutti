import { NextResponse, type NextRequest } from "next/server";
import { getSession, safeNext } from "@/lib/auth";
import { AREAS, areaOf } from "@/lib/areas";
import { googleLoginRedirectUri, googleOAuthConfigured, LOGIN_COOKIE, LOGIN_COOKIE_PATH, loginAuthUrl, newPkce } from "@/lib/providers/google-login";

// Início do "Entrar com Google" (login, cadastro ou convite) e do vínculo em Segurança da conta (?vincular=1).
// Guarda state + verificador PKCE + área + destino num cookie curto e manda para o Google.
export const GET = async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const area = areaOf(params.get("area"));
  const link = params.get("vincular") === "1";
  const session = link ? await getSession() : null;
  if (link && !session) return NextResponse.redirect(new URL("/login", req.url));
  // O usuário de suporte nunca vincula conta Google.
  if (session?.supportGrantId) return NextResponse.redirect(new URL("/app", req.url));
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL(link ? "/app/conta/seguranca?google=erro" : `${AREAS[area].loginPath}?error=google`, req.url));
  }

  const { verifier, challenge, state } = newPkce();
  const res = NextResponse.redirect(
    loginAuthUrl({ redirectUri: googleLoginRedirectUri(req.url), state, challenge, loginHint: session?.email.includes("@") ? session.email : undefined }),
  );
  const next = safeNext(params.get("next"));
  res.cookies.set(LOGIN_COOKIE, JSON.stringify({ state, verifier, area, next, linkUserId: session?.userId ?? null }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // o retorno é uma navegação de nível superior vinda do Google
    path: LOGIN_COOKIE_PATH,
    maxAge: 600,
  });
  return res;
};
