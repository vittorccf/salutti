import { NextResponse, type NextRequest } from "next/server";
import { AREAS, areaOf } from "@/lib/areas";

// "Usar outro e-mail": esquece a conta Google pendente e volta ao cadastro comum.
export const GET = (req: NextRequest) => {
  const res = NextResponse.redirect(new URL(AREAS[areaOf(req.nextUrl.searchParams.get("area"))].signupPath, req.url));
  res.cookies.delete("salutti_google_pending");
  return res;
};
