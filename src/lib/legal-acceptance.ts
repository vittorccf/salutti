import { headers } from "next/headers";
import { recordAudit } from "@/lib/audit";
import { LEGAL_VERSION } from "@/lib/legal";

// Prova do aceite dos Termos e da Política: além de data e versão no usuário, um registro de auditoria com IP e navegador.
export async function auditTermsAcceptance(workspaceId: string, userId: string, via: "signup" | "invite" | "update") {
  const h = headers();
  await recordAudit({
    workspaceId,
    userId,
    action: "legal.accept",
    entity: "User",
    entityId: userId,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    metadata: { version: LEGAL_VERSION, via, userAgent: h.get("user-agent")?.slice(0, 300) ?? null },
  });
}
