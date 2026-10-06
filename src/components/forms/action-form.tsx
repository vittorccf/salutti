"use client";
import { useFormState } from "react-dom";
import { FormError } from "./form-error";

export type FormResult = { erro?: string } | null;
export type FormAction = (prev: FormResult, formData: FormData) => Promise<FormResult>;

// Formulário de Server Action que mostra o erro de validação sem recarregar a página: o que foi digitado
// continua nos campos e a mensagem não passa pela URL (nem pelo histórico, nem pelos logs).
export function ActionForm({ action, className, children }: { action: FormAction; className?: string; children: React.ReactNode }) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className={className}>
      <FormError message={state?.erro} />
      {children}
    </form>
  );
}
