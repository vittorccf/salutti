import type { ReactNode } from "react";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";

// Links do texto "Li e aceito os <terms>…</terms> e a <privacy>…</privacy>" (t.rich). Abrem em outra aba para
// não perder o que já foi preenchido no formulário.
const link = (href: string) =>
  function LegalLink(chunks: ReactNode) {
    return (
      <a href={href} target="_blank" rel="noopener" className="text-brand underline underline-offset-4">
        {chunks}
      </a>
    );
  };

export const legalLinks = { terms: link(TERMS_PATH), privacy: link(PRIVACY_PATH) };

// Aceite obrigatório no cadastro (o servidor também confere o campo acceptTerms).
export function TermsCheckbox({ label }: { label: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <input id="acceptTerms" name="acceptTerms" type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
      <label htmlFor="acceptTerms">
        {label}
      </label>
    </div>
  );
}
