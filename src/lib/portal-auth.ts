// Acesso do paciente ao portal (só no servidor). Separado da sessão do app: cookie próprio, JWT com tipo "portal".
//
// Fluxo (custo zero, sem e-mail nem SMS): o profissional gera um convite de uso único (72h) e manda pelo WhatsApp dele;
// o paciente confirma a data de nascimento, informa o CPF e cria a senha; depois entra com CPF + senha.
// Esqueceu a senha: o profissional gera um novo convite, que troca a senha e derruba as sessões abertas.
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { secretKey } from "@/lib/auth";

export const PORTAL_COOKIE = "salutti_portal";
export const INVITE_HOURS = 72;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const SESSION_DAYS = 30;

export const newInviteToken = () => crypto.randomBytes(24).toString("base64url");
export const hashInviteToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

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

type PortalJwt = { accessId: string; patientId: string; workspaceId: string; typ: "portal" };

export async function createPortalSession(access: { id: string; patientId: string }, workspaceId: string) {
  const token = await new SignJWT({ accessId: access.id, patientId: access.patientId, workspaceId, typ: "portal" } satisfies PortalJwt)
    .setProtectedHeader({ alg: "HS256" })
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

// Sessão válida só se o acesso continua ativo, o paciente não foi excluído e a senha não mudou depois do login.
export async function getPortalSession() {
  const raw = cookies().get(PORTAL_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secretKey());
    const p = payload as unknown as PortalJwt & { iat?: number };
    if (p.typ !== "portal") return null;
    const access = await db.patientPortalAccess.findFirst({
      where: { id: p.accessId, patientId: p.patientId, active: true, activatedAt: { not: null } },
      include: { patient: { include: { workspace: true } } },
    });
    if (!access || access.patient.deletedAt || access.patient.workspaceId !== p.workspaceId) return null;
    if (access.passwordChangedAt && p.iat && access.passwordChangedAt.getTime() > p.iat * 1000 + 1000) return null;
    return access;
  } catch {
    return null;
  }
}

export type PortalAccessWithPatient = NonNullable<Awaited<ReturnType<typeof getPortalSession>>>;
