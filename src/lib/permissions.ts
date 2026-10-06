// Quem vê conteúdo clínico (prontuário, evoluções, anamnese, humor diário). Recepção e financeiro trabalham
// com agenda, cadastro e cobrança, mas não leem o prontuário: sigilo (Código de Ética do Psicólogo, art. 9º)
// e necessidade (LGPD, art. 6º, III).
import { notFound } from "next/navigation";
import { requireContext } from "./auth";

export const CLINICAL_ROLES = ["owner", "admin", "professional"] as const;

export const canSeeClinical = (role: string) => (CLINICAL_ROLES as readonly string[]).includes(role);

// Para páginas e actions clínicas: sem permissão, responde como se a página não existisse.
export async function requireClinicalContext() {
  const ctx = await requireContext();
  if (!canSeeClinical(ctx.role)) notFound();
  return ctx;
}
