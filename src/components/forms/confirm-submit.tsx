"use client";
import { Button, type ButtonProps } from "@/components/ui/button";

// Botão de envio que pede confirmação antes de uma ação difícil de desfazer (estornar, remover anexo).
export function ConfirmSubmit({ confirmText, children, ...props }: ButtonProps & { confirmText: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
