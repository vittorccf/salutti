"use client";
import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { FormError } from "./form-error";

export type FormResult = { erro?: string; ok?: string } | null;
export type FormAction = (prev: FormResult, formData: FormData) => Promise<FormResult>;

// Formulário de Server Action que mostra o erro de validação sem recarregar a página: o que foi digitado
// continua nos campos e a mensagem não passa pela URL (nem pelo histórico, nem pelos logs).
export function ActionForm({
  action,
  className,
  id,
  children,
  resetOnSuccess = false,
}: {
  action: FormAction;
  className?: string;
  id?: string;
  children: React.ReactNode;
  // Limpa os campos depois de um envio bem-sucedido (ex.: caixa de mensagem, para não reenviar o mesmo texto).
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useFormState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      <FormError message={state?.erro} />
      {state?.ok ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {state.ok}
        </p>
      ) : null}
      {children}
    </form>
  );
}
