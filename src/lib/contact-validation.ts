// Validação de contato e endereço no servidor, compartilhada pelos formulários.
import { emailSchema } from "./email";
import { emailDomainAcceptsMail } from "./email-server";
import { DEFAULT_COUNTRY, isCountryCode, toE164 } from "./phone";
import { normalizeCep } from "./cep";

export class ContactError extends Error {}

// E-mail opcional: vazio → null; formato inválido ou domínio que não recebe e-mail → erro.
// `previous`: na edição, e-mail que não mudou não passa de novo pelo DNS (domínio antigo não trava a ficha).
export async function validEmail(
  raw: FormDataEntryValue | null,
  { required = false, previous }: { required?: boolean; previous?: string | null } = {},
): Promise<string | null> {
  const value = String(raw ?? "").trim();
  if (!value) {
    if (required) throw new ContactError("Informe o e-mail.");
    return null;
  }
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) throw new ContactError("E-mail inválido. Confira o endereço.");
  if (parsed.data === previous) return parsed.data;
  if (!(await emailDomainAcceptsMail(parsed.data))) {
    throw new ContactError("O domínio do e-mail não recebe mensagens. Confira o que vem depois do @.");
  }
  return parsed.data;
}

// Telefone opcional, enviado pelo PhoneInput já em E.164 (ou como digitado, se inválido) e o país escolhido.
// `previous`: telefone antigo fora do padrão que não foi tocado continua como está.
export function validPhone(
  raw: FormDataEntryValue | null,
  { label = "Telefone", country, previous }: { label?: string; country?: FormDataEntryValue | null; previous?: string | null } = {},
): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value === previous) return value;
  const e164 = toE164(value, isCountryCode(country) ? country : DEFAULT_COUNTRY);
  if (!e164) throw new ContactError(`${label} inválido. Confira o país e o número.`);
  return e164;
}

const clean = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max) || null;

export function readAddress(formData: FormData) {
  const cep = normalizeCep(String(formData.get("cep") ?? ""));
  if (cep && cep.length !== 8) throw new ContactError("CEP inválido. Use 8 dígitos.");
  const state = clean(formData.get("state"), 2)?.toUpperCase() ?? null;
  return {
    cep: cep || null,
    street: clean(formData.get("street")),
    addressNumber: clean(formData.get("addressNumber"), 20),
    complement: clean(formData.get("complement")),
    district: clean(formData.get("district")),
    city: clean(formData.get("city")),
    state,
  };
}
