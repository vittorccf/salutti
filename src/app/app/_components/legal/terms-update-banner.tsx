import { revalidatePath } from "next/cache";
import { getTranslations } from "@/i18n/server";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { LEGAL_VERSION, termsAcceptance } from "@/lib/legal";
import { auditTermsAcceptance } from "@/lib/legal-acceptance";
import { legalLinks } from "@/components/legal/terms-checkbox";
import { Button } from "@/components/ui/button";

async function acceptTermsAction() {
  "use server";
  const ctx = await requireContext();
  if (ctx.user.termsVersion === LEGAL_VERSION) return;
  await db.user.update({ where: { id: ctx.user.id }, data: termsAcceptance() });
  await auditTermsAcceptance(ctx.workspace.id, ctx.user.id, "update");
  revalidatePath("/app", "layout");
}

// Quem criou a conta antes dos documentos (ou de uma versão nova deles) vê este aviso até aceitar.
export async function TermsUpdateBanner({ termsVersion }: { termsVersion: string | null }) {
  if (termsVersion === LEGAL_VERSION) return null;
  const t = await getTranslations("common.layout.terms");
  return (
    <form
      action={acceptTermsAction}
      role="region"
      aria-label={t("label")}
      className="flex flex-col gap-3 border-b bg-accent px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between md:px-6"
    >
      <p>{t.rich(termsVersion ? "updated" : "first", legalLinks)}</p>
      <Button type="submit" size="sm" className="shrink-0">{t("accept")}</Button>
    </form>
  );
}
