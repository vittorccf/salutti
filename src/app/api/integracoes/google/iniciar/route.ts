import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { authUrl, googleOAuthConfigured, newPkce, OAUTH_COOKIE } from "@/lib/providers/google-oauth";

// Início da conexão do Google: guarda state + verificador PKCE + quem pediu num cookie curto e manda para o Google.
export const GET = async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  if (!googleOAuthConfigured()) return NextResponse.redirect(new URL("/app/ajustes?google=indisponivel#conexoes", req.url));

  const { verifier, challenge, state } = newPkce();
  const redirectUri = new URL("/api/integracoes/google/retorno", req.url).toString();
  const res = NextResponse.redirect(authUrl({ redirectUri, state, challenge, loginHint: session.email }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, userId: session.userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // o retorno é uma navegação de nível superior vinda do Google
    path: "/api/integracoes/google",
    maxAge: 600,
  });
  return res;
};
