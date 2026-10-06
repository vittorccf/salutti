// Só no servidor: confere se o domínio do e-mail existe e recebe mensagens (registro MX ou A).
// Falha de rede ou DNS lento não bloqueia o cadastro: só recusa quando o domínio comprovadamente não existe.
import { promises as dns } from "node:dns";

const TIMEOUT_MS = 1500;

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);

const notFound = (e: unknown) => {
  const code = (e as { code?: string }).code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
};

export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  // Sem MX, o padrão de e-mail usa o próprio registro A do domínio; as duas consultas correm juntas.
  const [mx, a] = await Promise.allSettled([withTimeout(dns.resolveMx(domain)), withTimeout(dns.resolve4(domain))]);
  if ((mx.status === "fulfilled" && mx.value.length > 0) || (a.status === "fulfilled" && a.value.length > 0)) return true;
  // Só recusa quando as duas respostas dizem que o domínio não existe ou não tem registro.
  const missing = (r: PromiseSettledResult<unknown[]>) => (r.status === "fulfilled" ? r.value.length === 0 : notFound(r.reason));
  return !(missing(mx) && missing(a));
}
