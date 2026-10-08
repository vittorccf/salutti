import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { completeLogin, getSession, safeNext, setPendingGoogle } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isSupportEmail } from "@/lib/support-access";
import { AREAS, areaOf } from "@/lib/areas";
import { exchangeLoginCode, googleLoginRedirectUri, LOGIN_COOKIE, LOGIN_COOKIE_PATH } from "@/lib/providers/google-login";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

type Saved = { state: string; verifier: string; area: string; next: string; linkUserId: string | null };

const auditAll = async (userId: string, action: string) => {
  const memberships = await db.membership.findMany({ where: { userId }, select: { workspaceId: true } });
  for (const m of memberships) await recordAudit({ workspaceId: m.workspaceId, userId, action, entity: "User", entityId: userId });
};

// Retorno do Google. Confere o state (CSRF) e lê a identidade. Daí:
// - vínculo (Segurança da conta): grava o sub no usuário logado;
// - conta já vinculada ao sub, ou com o mesmo e-mail confirmado pelo Google: entra (com 2FA, se ativa);
// - ninguém: guarda a identidade num cookie assinado e segue para o cadastro da área (ou para o convite).
export const GET = async (req: NextRequest) => {
  let saved: Saved | null = null;
  try {
    saved = JSON.parse(req.cookies.get(LOGIN_COOKIE)?.value ?? "null");
  } catch {
    saved = null;
  }
  cookies().delete({ name: LOGIN_COOKIE, path: LOGIN_COOKIE_PATH });
  const area = AREAS[areaOf(saved?.area)];
  const fail = (code: "google" | "googleEmail"): never =>
    saved?.linkUserId ? redirect(`/app/conta/seguranca?google=${code === "google" ? "erro" : "email"}`) : redirect(`${area.loginPath}?error=${code}`);

  const params = req.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  if (!saved || !state || !same(state, saved.state)) return fail("google");
  // Desistiu na tela do Google: volta sem mensagem de erro.
  if (params.get("error")) return redirect(saved.linkUserId ? "/app/conta/seguranca" : area.loginPath);
  const code = params.get("code");
  if (!code) return fail("google");

  let identity;
  try {
    identity = await exchangeLoginCode({ code, redirectUri: googleLoginRedirectUri(req.url), verifier: saved.verifier });
  } catch (e) {
    console.error("[google-login] falha na troca do código", e);
    return fail("google");
  }
  if (!identity.emailVerified) return fail("googleEmail");
  // O usuário oculto do suporte só entra com a senha de uma concessão do backoffice, nunca pelo Google.
  if (isSupportEmail(identity.email)) return fail("google");

  if (saved.linkUserId) {
    const session = await getSession();
    if (!session || session.userId !== saved.linkUserId) return redirect("/login");
    const owner = await db.user.findUnique({ where: { googleSub: identity.sub }, select: { id: true } });
    if (owner && owner.id !== session.userId) return redirect("/app/conta/seguranca?google=emuso");
    await db.user.update({ where: { id: session.userId }, data: { googleSub: identity.sub, googleEmail: identity.email } });
    await auditAll(session.userId, "auth.google_link");
    return redirect("/app/conta/seguranca?google=ok");
  }

  const include = { memberships: { select: { workspaceId: true } } } as const;
  let user = await db.user.findUnique({ where: { googleSub: identity.sub }, include });
  if (!user) {
    // Mesmo e-mail, ainda sem Google: vincula. Seguro porque o Google confirmou que a pessoa controla o e-mail.
    const byEmail = await db.user.findFirst({ where: { email: { equals: identity.email, mode: "insensitive" } }, include });
    if (byEmail?.googleSub) return fail("google"); // e-mail já ligado a outra conta Google
    if (byEmail) {
      user = await db.user.update({ where: { id: byEmail.id }, data: { googleSub: identity.sub, googleEmail: identity.email }, include });
      await auditAll(user.id, "auth.google_link");
    }
  }
  if (user) return completeLogin(user, saved.next);

  await setPendingGoogle({ sub: identity.sub, email: identity.email, name: identity.name });
  const next = safeNext(saved.next);
  return redirect(next !== "/app" ? next : area.signupPath);
};
