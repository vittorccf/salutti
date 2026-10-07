// Sessão do backoffice (/backoffice): equipe da Salutti, separada da sessão dos consultórios.
// Cookie próprio, audiência própria no JWT e validade curta; usuário desativado perde o acesso na hora.
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { secretKey } from "@/lib/auth";

const COOKIE = "salutti_bo";
const AUDIENCE = "salutti-backoffice";
const HOURS = 12;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type BackofficeRole = "admin" | "suporte";

export const createBackofficeSession = async (userId: string) => {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(secretKey());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/backoffice",
    maxAge: HOURS * 60 * 60,
  });
};

export const destroyBackofficeSession = () => cookies().delete({ name: COOKIE, path: "/backoffice" });

export const getBackofficeUser = async () => {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE });
    if (!payload.sub) return null;
    const user = await db.backofficeUser.findUnique({ where: { id: payload.sub } });
    if (!user?.active) return null;
    // Trocar ou redefinir a senha derruba as sessões abertas antes disso (iat em segundos).
    if (!payload.iat || payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
    return user;
  } catch {
    return null;
  }
};

// Toda página e action do backoffice passa por aqui. Senha provisória obriga a trocar antes de qualquer outra tela.
export const requireBackoffice = async (opts: { role?: BackofficeRole; allowPendingPassword?: boolean } = {}) => {
  const user = await getBackofficeUser();
  if (!user) redirect("/backoffice/login");
  if (user.mustChangePassword && !opts.allowPendingPassword) redirect("/backoffice/senha");
  if (opts.role === "admin" && user.role !== "admin") redirect("/backoffice");
  return user;
};

export const requestIp = () => headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const recordBackofficeAudit = (input: {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) =>
  db.backofficeAuditLog.create({
    data: {
      backofficeUserId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: (input.metadata ?? undefined) as object | undefined,
      ipAddress: requestIp(),
    },
  });
