import { destroySession, getSession } from "@/lib/auth";
import { endSupportGrant } from "@/lib/support-access";
import { NextResponse } from "next/server";

// Só POST: um GET seria disparado pelo prefetch do <Link> e encerraria a sessão sozinho.
export const POST = async (request: Request) => {
  // Sair do acesso de suporte encerra a concessão (a senha já era de uso único; isto registra o fim no consultório).
  const session = await getSession();
  if (session?.supportGrantId) await endSupportGrant(session.supportGrantId);
  destroySession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
};
