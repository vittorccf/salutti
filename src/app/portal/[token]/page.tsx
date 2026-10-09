import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Link antigo do portal (antes da senha). Ainda sem senha: vira o convite para criá-la.
// Já com senha (ou link desconhecido): vai para a tela de entrar. O link sozinho não abre mais o portal.
export default async function LegacyPortalLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await db.patientPortalAccess.findFirst({ where: { token, active: true }, select: { activatedAt: true } });
  if (access && !access.activatedAt) redirect(`/portal/convite/${token}`);
  redirect("/portal/entrar");
}
