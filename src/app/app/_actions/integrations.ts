"use server";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { decryptSecret } from "@/lib/totp";
import { revoke } from "@/lib/providers/google-oauth";

// Desconecta a conta Google do próprio usuário: revoga no Google e apaga o token guardado.
export async function disconnectGoogleAction() {
  const ctx = await requireContext();
  const conn = await db.integrationConnection.findUnique({
    where: { userId_provider: { userId: ctx.user.id, provider: "google" } },
  });
  if (conn) {
    try {
      await revoke(decryptSecret(conn.refreshToken));
    } catch {
      // Segredo ilegível (chave trocada): apaga mesmo assim; a pessoa pode revogar em myaccount.google.com.
    }
    await db.integrationConnection.delete({ where: { id: conn.id } });
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "integration.google.disconnect",
      entity: "User",
      entityId: ctx.user.id,
    });
  }
  redirect("/app/ajustes?google=desconectado#conexoes");
}
