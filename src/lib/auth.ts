// Auth minimalista baseado em JWT em cookie httpOnly.
// Em produção: usar next-auth (Auth.js) com sessões em DB; aqui é pragmático.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import bcrypt from "bcryptjs";

// Fora de produção há um segredo padrão para o app rodar sem configuração. Em produção ele é
// obrigatório: o padrão está no repositório público e permitiria forjar sessões.
const DEV_SECRET = "dev-secret-salutti-prototype";
const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
const secretKey = () => {
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
export const verifyPassword = (password: string, hash: string) =>
  bcrypt.compare(password, hash);

export const createSession = async (payload: SessionPayload) => {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  cookies().set(COOKIE_NAME, token, cookieBase);
};

export const destroySession = () => {
  cookies().delete(COOKIE_NAME);
  cookies().delete(COOKIE_WS);
};

export const getSession = async (): Promise<SessionPayload | null> => {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
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
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
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
