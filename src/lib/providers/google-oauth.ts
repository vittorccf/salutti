// Conexão do Google de cada usuário (OAuth 2.0 para apps web, com PKCE), para criar o Meet no Google Agenda
// da própria pessoa. A plataforma registra um app OAuth (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET); cada usuário
// autoriza a própria conta em Ajustes. O escopo calendar.events é "sensível": até o Google verificar o app, só
// usuários de teste cadastrados no console conseguem conectar (limite de 100).
// URI de retorno a cadastrar no console: <origem>/api/integracoes/google/retorno
import crypto from "node:crypto";

// URI de retorno: APP_URL (domínio de produção cadastrado no Google) quando existir; senão, a origem do pedido.
export const googleRedirectUri = (requestUrl: string) =>
  new URL("/api/integracoes/google/retorno", process.env.APP_URL || requestUrl).toString();

// Cookie curto com state, verificador PKCE e usuário, entre o início e o retorno da autorização.
export const OAUTH_COOKIE = "salutti_google_oauth";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = ["openid", "email", CALENDAR_SCOPE];

export const googleOAuthConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const b64url = (buf: Buffer) => buf.toString("base64url");

export function newPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(crypto.randomBytes(16)) };
}

export function authUrl({ redirectUri, state, challenge, loginHint }: { redirectUri: string; state: string; challenge: string; loginHint?: string }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent: o Google devolve o refresh token (sem ele, não dá para criar reuniões depois).
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export class GoogleScopeError extends Error {}
// invalid_grant: a pessoa revogou o acesso, trocou a senha, ou (app em modo de teste) o token passou de 7 dias.
export class GoogleTokenRevokedError extends Error {}

// Troca o código pelo refresh token. Com o consentimento granular do Google, a pessoa pode desmarcar a
// permissão do Agenda: nesse caso a conexão não serve e é recusada (o token é revogado).
export async function exchangeCode({ code, redirectUri, verifier }: { code: string; redirectUri: string; verifier: string }) {
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
  const body = (await res.json()) as { refresh_token?: string; access_token?: string; scope?: string; id_token?: string };
  const scopes = (body.scope ?? "").split(" ");
  if (!scopes.includes(CALENDAR_SCOPE)) {
    if (body.access_token) await revoke(body.access_token);
    throw new GoogleScopeError("permissão do Google Agenda não concedida");
  }
  if (!body.refresh_token) throw new Error("Google não devolveu o refresh token");
  return { refreshToken: body.refresh_token, scopes: scopes.join(" "), email: emailFromIdToken(body.id_token) };
}

// O id_token veio direto do endpoint de token do Google (TLS), então basta ler o e-mail, sem validar a assinatura.
function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export async function accessTokenFrom(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new GoogleTokenRevokedError("refresh token vencido ou revogado");
    throw new Error(`Google OAuth: ${res.status}`);
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function revoke(token: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Revogar é cortesia: a conexão some do banco de qualquer jeito, e a pessoa pode revogar na conta Google.
  }
}
