// Busca de endereço por CEP: ViaCEP, com BrasilAPI (v2) como reserva. Só no servidor.
export type CepAddress = { cep: string; street: string; district: string; city: string; state: string };

const TIMEOUT_MS = 4000;

export const normalizeCep = (cep: string) => cep.replace(/\D/g, "");
export const formatCep = (cep: string) => normalizeCep(cep).replace(/^(\d{5})(\d{3})$/, "$1-$2");

async function fetchJson(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    clearTimeout(t);
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

async function viaCep(cep: string): Promise<CepAddress | null | "erro"> {
  const { body } = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (!body) return "erro";
  if (body.erro) return null; // CEP inexistente
  return { cep, street: str(body.logradouro), district: str(body.bairro), city: str(body.localidade), state: str(body.uf) };
}

async function brasilApi(cep: string): Promise<CepAddress | null | "erro"> {
  const { status, body } = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (status === 404) return null;
  if (!body) return "erro";
  return { cep, street: str(body.street), district: str(body.neighborhood), city: str(body.city), state: str(body.state) };
}

// null = CEP não existe; "indisponivel" = os dois serviços falharam.
export async function lookupCep(raw: string): Promise<CepAddress | null | "indisponivel"> {
  const cep = normalizeCep(raw);
  if (!/^\d{8}$/.test(cep)) return null;
  for (const source of [viaCep, brasilApi]) {
    try {
      const r = await source(cep);
      if (r !== "erro") return r;
    } catch {
      // tenta a próxima fonte
    }
  }
  return "indisponivel";
}
