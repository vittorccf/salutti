// "Entrar com Google": OAuth 2.0 com PKCE pedindo só a identidade (openid, email, profile). Usa o mesmo cliente
// OAuth da conexão do Agenda (GOOGLE_CLIENT_ID/SECRET), mas é outro fluxo: não pede o Agenda nem guarda token,
// e esses escopos básicos não dependem da verificação do Google.
// URI de retorno a cadastrar no console: <origem>/api/auth/google/retorno
export { googleOAuthConfigured, newPkce } from "./google-oauth";

export const LOGIN_COOKIE = "salutti_google_login";
export const LOGIN_COOKIE_PATH = "/api/auth/google";

export const googleLoginRedirectUri = (requestUrl: string) =>
  new URL("/api/auth/google/retorno", process.env.APP_URL || requestUrl).toString();

export function loginAuthUrl({ redirectUri, state, challenge, loginHint }: { redirectUri: string; state: string; challenge: string; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    // Deixa escolher a conta: num computador com mais de uma conta Google, entrar com a errada é comum.
    prompt: "select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string };

// Lê a identidade do id_token. Ele veio direto do endpoint de token do Google (TLS, autenticado com o segredo
// do cliente), então não é preciso validar a assinatura; o público (aud) é conferido mesmo assim.
export function identityFromIdToken(idToken: string | undefined, clientId: string): GoogleIdentity | null {
  if (!idToken) return null;
  try {
    const p = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as {
      sub?: string;
      aud?: string;
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    };
    if (!p.sub || !p.email || p.aud !== clientId) return null;
    return {
      sub: p.sub,
      email: p.email.toLowerCase(),
      emailVerified: p.email_verified === true || p.email_verified === "true",
      name: (p.name ?? "").trim().slice(0, 120),
    };
  } catch {
    return null;
  }
}

export async function exchangeLoginCode({ code, redirectUri, verifier }: { code: string; redirectUri: string; verifier: string }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth: ${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  const identity = identityFromIdToken(body.id_token, process.env.GOOGLE_CLIENT_ID!);
  if (!identity) throw new Error("Google não devolveu a identidade");
  return identity;
}
