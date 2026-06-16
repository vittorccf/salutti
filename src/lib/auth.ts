// Auth minimalista baseado em JWT em cookie httpOnly.
// Em produção: usar next-auth (Auth.js) com sessões em DB; aqui é pragmático.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import bcrypt from "bcryptjs";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-saluti-prototype",
);
const COOKIE_NAME = "saluti_session";
const COOKIE_WS = "saluti_ws";

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
    .sign(SECRET);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
};

export const destroySession = () => {
  cookies().delete(COOKIE_NAME);
  cookies().delete(COOKIE_WS);
};

export const getSession = async (): Promise<SessionPayload | null> => {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
};

export const setActiveWorkspaceCookie = (workspaceId: string) => {
  cookies().set(COOKIE_WS, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
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
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return ctx;
};
