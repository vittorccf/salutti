import { destroySession } from "@/lib/auth";
import { NextResponse } from "next/server";

// Só POST: um GET seria disparado pelo prefetch do <Link> e encerraria a sessão sozinho.
export const POST = async (request: Request) => {
  destroySession();
  return NextResponse.redirect(new URL("/login", request.url), 303);
};
