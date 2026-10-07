import { NextResponse } from "next/server";
import { APP_COMMIT, APP_VERSION } from "@/lib/version";

// Pública e sem dados de cliente: serve para conferir o que está no ar (suporte, monitoramento).
export function GET() {
  return NextResponse.json({ version: APP_VERSION, commit: APP_COMMIT || null });
}
