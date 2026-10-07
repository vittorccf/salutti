// Auth minimalista baseado em JWT em cookie httpOnly.
// Em produção: usar next-auth (Auth.js) com sessões em DB; aqui é pragmático.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

// Fora de produção há um segredo padrão para o app rodar sem configuração. Em produção ele é
// obrigatório: o padrão está no repositório público e permitiria forjar sessões.
const DEV_SECRET = "dev-secret-salutti-prototype";
const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
export const secretKey = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret && isProduction) {
    throw new Error("AUTH_SECRET não definido. Configure a variável de ambiente (32+ caracteres aleatórios).");
  }
  return new TextEncoder().encode(secret ?? DEV_SECRET);
};

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
const COOKIE_NAME = "salutti_session";
const COOKIE_WS = "salutti_ws";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
};

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
// Conta criada só com o Google não tem senha: nenhuma senha confere.
export const verifyPassword = async (password: string, hash: string | null) =>
  hash ? bcrypt.compare(password, hash) : false;

export const createSession = async (payload: SessionPayload) => {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, cookieBase);
  // Idioma escolhido em Ajustes vale em qualquer navegador onde a pessoa entrar.
  const user = await db.user.findUnique({ where: { id: payload.userId }, select: { locale: true } });
  // Perfil com idioma: ele vale. Sem idioma no perfil: a escolha feita na tela de login (cookie) passa a ser
  // o idioma do perfil. O logout apaga o cookie, então num computador compartilhado não sobra a escolha de outra pessoa.
  const chosen = cookies().get(LOCALE_COOKIE)?.value;
  if (user?.locale && isLocale(user.locale)) {
    cookies().set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else if (isLocale(chosen)) {
    await db.user.update({ where: { id: payload.userId }, data: { locale: chosen } });
  }
};

export const destroySession = () => {
  cookies().delete(COOKIE_NAME);
  cookies().delete(COOKIE_WS);
  cookies().delete(LOCALE_COOKIE);
};

export const getSession = async (): Promise<SessionPayload | null> => {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    // Tokens com audiência (etapa de 2FA, backoffice) usam a mesma chave: nunca podem valer como sessão do app.
    if (payload.aud) return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
};

// --- Etapa de verificação em duas etapas (entre a senha e a sessão) ---
const COOKIE_2FA = "salutti_2fa";
const TWO_FACTOR_AUDIENCE = "salutti-2fa";

export const startTwoFactor = async (userId: string) => {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(TWO_FACTOR_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secretKey());
  cookies().set(COOKIE_2FA, token, { ...cookieBase, maxAge: 5 * 60 });
};

export const getPendingTwoFactor = async (): Promise<string | null> => {
  const token = cookies().get(COOKIE_2FA)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: TWO_FACTOR_AUDIENCE });
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
};

export const clearPendingTwoFactor = () => cookies().delete(COOKIE_2FA);

// --- Conta Google ainda sem cadastro (entre o retorno do Google e o fim do cadastro ou do convite) ---
const COOKIE_GOOGLE = "salutti_google_pending";
const GOOGLE_PENDING_AUDIENCE = "salutti-google-pending";
export type PendingGoogle = { sub: string; email: string; name: string };

export const setPendingGoogle = async (identity: PendingGoogle) => {
  const token = await new SignJWT({ ...identity })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(GOOGLE_PENDING_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secretKey());
  cookies().set(COOKIE_GOOGLE, token, { ...cookieBase, maxAge: 30 * 60 });
};

export const getPendingGoogle = async (): Promise<PendingGoogle | null> => {
  const token = cookies().get(COOKIE_GOOGLE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: GOOGLE_PENDING_AUDIENCE });
    const { sub, email, name } = payload as Partial<PendingGoogle>;
    return typeof sub === "string" && typeof email === "string" ? { sub, email, name: typeof name === "string" ? name : "" } : null;
  } catch {
    return null;
  }
};

export const clearPendingGoogle = () => cookies().delete(COOKIE_GOOGLE);

// Destino depois do login: só caminhos internos de convite, nunca uma URL externa.
export const safeNext = (next: unknown) => (typeof next === "string" && /^\/convite\/[A-Za-z0-9_-]+$/.test(next) ? next : "/app");

// Fim comum do login (senha ou Google): com 2FA, a sessão só nasce depois do código.
export const completeLogin = async (
  user: { id: string; email: string; name: string; totpEnabledAt: Date | null; memberships: { workspaceId: string }[] },
  next?: unknown,
): Promise<never> => {
  if (user.totpEnabledAt) {
    await startTwoFactor(user.id);
    redirect("/login/verificar");
  }
  await createSession({ userId: user.id, email: user.email, name: user.name });
  const firstWs = user.memberships[0];
  if (firstWs) setActiveWorkspaceCookie(firstWs.workspaceId);
  redirect(safeNext(next));
};

export const setActiveWorkspaceCookie = (workspaceId: string) => {
  cookies().set(COOKIE_WS, workspaceId, cookieBase);
};

export const getActiveWorkspaceId = () => cookies().get(COOKIE_WS)?.value ?? null;

// Resolve usuário + workspace ativo + role
export const getCurrentContext = async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { memberships: { include: { workspace: true } } },
  });
  if (!user || user.memberships.length === 0) return null;

  let activeWsId = getActiveWorkspaceId();
  let membership = user.memberships.find((m) => m.workspaceId === activeWsId);
  if (!membership) membership = user.memberships[0]!;

  return {
    user: { id: user.id, email: user.email, name: user.name, birthDate: user.birthDate, showPatientBirthdays: user.showPatientBirthdays, avatarId: user.avatarId, locale: user.locale, termsVersion: user.termsVersion },
    workspace: membership.workspace,
    role: membership.role,
    allWorkspaces: user.memberships.map((m) => m.workspace),
  };
};

export const requireContext = async () => {
  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  return ctx;
};
