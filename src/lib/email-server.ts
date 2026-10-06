// Só no servidor: confere se o domínio do e-mail existe e recebe mensagens (registro MX ou A).
// Falha de rede ou DNS lento não bloqueia o cadastro: só recusa quando o domínio comprovadamente não existe.
import { promises as dns } from "node:dns";

const TIMEOUT_MS = 3000;

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS))]);

const notFound = (e: unknown) => {
  const code = (e as { code?: string }).code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
};

export async function emailDomainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length > 0) return true;
  } catch (e) {
    if (!notFound(e)) return true;
  }
  try {
    // Sem MX, o padrão de e-mail usa o próprio registro A do domínio.
    const a = await withTimeout(dns.resolve4(domain));
    return a.length > 0;
  } catch (e) {
    return !notFound(e);
  }
}
