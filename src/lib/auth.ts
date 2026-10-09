// Auth minimalista baseado em JWT em cookie httpOnly.
// Em produção: usar next-auth (Auth.js) com sessões em DB; aqui é pragmático.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getLiveGrant, SUPPORT_ROLE } from "./support-access";
import { LEGAL_VERSION } from "./legal";
import { SESSION_COOKIE } from "./session-cookie";
import { effectiveAppPermissions } from "./app-permissions";
import { accessExpired } from "@/lib/plan-access";

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
const COOKIE_NAME = SESSION_COOKIE;
const COOKIE_WS = "salutti_ws";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  // Sessão do "Suporte Salutti": presa a uma concessão (consultório e prazo). Ver src/lib/support-access.ts.
  supportGrantId?: string;
};

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
// Conta criada só com o Google não tem senha: nenhuma senha confere.
export const verifyPassword = async (password: string, hash: string | null) =>
  hash ? bcrypt.compare(password, hash) : false;

export const createSession = async (payload: SessionPayload, opts: { expiresAt?: Date } = {}) => {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.expiresAt ?? "30d")
    .sign(secretKey());

  const maxAge = opts.expiresAt ? Math.max(1, Math.floor((opts.expiresAt.getTime() - Date.now()) / 1000)) : cookieBase.maxAge;
  cookies().set(COOKIE_NAME, token, { ...cookieBase, maxAge });
  if (payload.supportGrantId) return;
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
    // Sessão do app sempre tem usuário: um token de outro tipo (ex.: portal do paciente) nunca vale aqui.
    if (typeof payload.userId !== "string" || !payload.userId) return null;
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
  if (session.supportGrantId) return getSupportContext(session);

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
    // Permissões efetivas do membro (papel + ajustes do dono/administrador).
    permissions: effectiveAppPermissions(membership.role, membership.permsGranted, membership.permsDenied),
    allWorkspaces: user.memberships.map((m) => m.workspace),
    support: null as { grantId: string; expiresAt: Date } | null,
  };
};

// Contexto do "Suporte Salutti": o consultório vem da concessão, não de Membership (o usuário é oculto em todas as contas).
// Concessão revogada, encerrada ou vencida derruba a sessão na hora.
const getSupportContext = async (session: SessionPayload) => {
  const [grant, user] = await Promise.all([
    getLiveGrant(session.supportGrantId!),
    db.user.findUnique({ where: { id: session.userId } }),
  ]);
  if (!grant || !user) return null;
  return {
    user: { id: user.id, email: user.email, name: user.name, birthDate: null, showPatientBirthdays: false, avatarId: null, locale: user.locale, termsVersion: LEGAL_VERSION },
    workspace: grant.workspace,
    role: SUPPORT_ROLE,
    // Suporte: só o que a recepção vê (nada clínico); a escrita já é bloqueada no Prisma.
    permissions: effectiveAppPermissions("receptionist"),
    allWorkspaces: [grant.workspace],
    support: { grantId: grant.id, expiresAt: grant.expiresAt },
  };
};

// Com o teste grátis vencido, tudo leva para /app/assinatura; `allowExpired` libera o que precisa continuar
// funcionando sem plano (assinar, exportar e excluir dados pela LGPD, segurança da conta, suporte).
export const requireContext = async (opts: { allowExpired?: boolean } = {}) => {
  const ctx = await getCurrentContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!opts.allowExpired && accessExpired(ctx.workspace)) redirect("/app/assinatura");
  return ctx;
};
