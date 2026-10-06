// Erro de validação vindo do servidor (via ?erro=), no topo do formulário.
export const FormError = ({ message }: { message?: string | null }) =>
  message ? (
    <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
      {message}
    </p>
  ) : null;
