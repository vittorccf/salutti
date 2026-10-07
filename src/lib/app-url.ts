// Só no servidor: endereço público do app para links enviados por mensagem (pagamento, convite).
// APP_URL quando configurado (domínio de produção); senão, o host do pedido (preview, local).
import { headers } from "next/headers";

export function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
