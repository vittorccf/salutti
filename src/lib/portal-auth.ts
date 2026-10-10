// Acesso do paciente ao portal (só no servidor). Separado da sessão do app: cookie próprio e JWT com audiência própria.
//
// Fluxo (custo zero, sem e-mail nem SMS): o profissional gera um convite de uso único (72h) e manda pelo WhatsApp dele;
// o paciente confirma a data de nascimento e/ou o CPF do cadastro e cria a senha; depois entra com CPF + senha.
// Esqueceu a senha: o profissional gera um novo convite, que troca a senha e derruba as sessões abertas.
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { secretKey } from "@/lib/auth";
import { moduleEnabled } from "@/lib/areas";

export const PORTAL_COOKIE = "salutti_portal";
const PORTAL_AUDIENCE = "salutti-portal";
export const INVITE_HOURS = 72;
const SESSION_DAYS = 30;

export const newInviteToken = () => crypto.randomBytes(24).toString("base64url");
export const hashInviteToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 40);

// Senhas óbvias (as mais usadas no Brasil e sequências). A lista completa de vazadas fica para quando houver API.
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234", "11223344",
  "password", "password1", "senha123", "senha1234", "mudar123", "brasil123", "qwerty123", "abcd1234",
  "iloveyou", "q1w2e3r4", "asdfghjk", "salutti123", "admin123", "abc12345", "123mudar", "minhasenha",
]);

export type PasswordProblem = "short" | "long" | "common" | "personal" | "mismatch";

// NIST SP 800-63B: tamanho mínimo, sem regras de composição, sem troca periódica, recusa de senhas comuns.
export function passwordProblem(password: string, confirm: string, personal: string[]): PasswordProblem | null {
  if (password.length < 8) return "short";
  if (password.length > 128) return "long";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(\d)\1+$/.test(password) || "0123456789012345678901234567890".includes(password)) return "common";
  const digits = password.replace(/\D/g, "");
  if (personal.some((p) => p && (lower === p.toLowerCase() || digits === p))) return "personal";
  if (password !== confirm) return "mismatch";
  return null;
}

// ------------------------------ Limite de tentativas ------------------------------
// Janela de 15 minutos. Por CPF + IP (5): quem não está na rede do paciente não o bloqueia. Por IP (30): segura
// varredura de vários CPFs. A resposta é a mesma exista o CPF ou não, então o limite não revela quem é paciente.
export const THROTTLE_MINUTES = 15;
const WINDOW_MS = THROTTLE_MINUTES * 60_000;

export const clientIp = () => {
  const h = headers();
  // Na Vercel, x-real-ip e x-vercel-forwarded-for vêm da própria plataforma; x-forwarded-for fica por último (fora dela, o cliente escolhe).
  return (h.get("x-vercel-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
};

export const throttleKeys = {
  cpfIp: (cpf: string, ip: string) => `cpfip:${sha(`${cpf}|${ip}`)}`,
  ip: (ip: string) => `ip:${sha(ip)}`,
  access: (accessId: string) => `access:${accessId}`,
};

export const LIMITS = { cpfIp: 5, ip: 30, access: 5 };

// true = já passou do limite na janela atual.
export async function isThrottled(key: string, limit: number) {
  const row = await db.portalThrottle.findUnique({ where: { key } });
  return !!row && row.windowStart.getTime() > Date.now() - WINDOW_MS && row.failures >= limit;
}

// Conta uma falha (atômico: duas tentativas ao mesmo tempo não passam do limite). Janela vencida recomeça.
export async function registerFailure(key: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const res = await db.portalThrottle.updateMany({ where: { key, windowStart: { gt: since } }, data: { failures: { increment: 1 } } });
  if (res.count) return;
  await db.portalThrottle.upsert({ where: { key }, create: { key, failures: 1 }, update: { failures: 1, windowStart: new Date() } });
}

export const clearThrottle = (key: string) => db.portalThrottle.deleteMany({ where: { key } });

// ------------------------------------ Sessão ------------------------------------

type PortalJwt = { accessId: string; patientId: string; workspaceId: string; sv: number; typ: "portal" };

export async function createPortalSession(access: { id: string; patientId: string; sessionVersion: number }, workspaceId: string) {
  const token = await new SignJWT({ accessId: access.id, patientId: access.patientId, workspaceId, sv: access.sessionVersion, typ: "portal" } satisfies PortalJwt)
    .setProtectedHeader({ alg: "HS256" })
    // Audiência própria: a sessão do app (getSession) recusa tokens com audiência, e o portal só aceita a dele.
    .setAudience(PORTAL_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  cookies().set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export const destroyPortalSession = () => cookies().set(PORTAL_COOKIE, "", { path: "/portal", maxAge: 0 });

// Sessão válida só se o acesso continua ativo, o paciente não foi excluído e a versão da sessão é a atual
// (troca de senha, novo convite usado e revogação sobem a versão).
export async function getPortalSession() {
  const raw = cookies().get(PORTAL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey(), { audience: PORTAL_AUDIENCE });
    const p = payload as unknown as PortalJwt;
    if (p.typ !== "portal" || typeof p.accessId !== "string") return null;
    const access = await db.patientPortalAccess.findFirst({
      where: { id: p.accessId, patientId: p.patientId, active: true, activatedAt: { not: null }, sessionVersion: p.sv },
      include: { patient: { include: { workspace: true } } },
    });
    if (!access || access.patient.deletedAt || access.patient.workspaceId !== p.workspaceId) return null;
    // Portal bloqueado para o consultório no backoffice: a sessão do paciente cai.
    if (!moduleEnabled(access.patient.workspace, "portal")) return null;
    return access;
  } catch {
    return null;
  }
}

export type PortalAccessWithPatient = NonNullable<Awaited<ReturnType<typeof getPortalSession>>>;
