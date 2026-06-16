import { destroySession } from "@/lib/auth";
import { NextResponse } from "next/server";

export const GET = async () => {
  destroySession();
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"));
};
