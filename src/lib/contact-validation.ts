// Validação de contato e endereço no servidor, compartilhada pelos formulários.
import { emailSchema } from "./email";
import { emailDomainAcceptsMail } from "./email-server";
import { toE164 } from "./phone";
import { normalizeCep } from "./cep";

export class ContactError extends Error {}

// E-mail opcional: vazio → null; formato inválido ou domínio que não recebe e-mail → erro.
export async function validEmail(raw: FormDataEntryValue | null, { required = false } = {}): Promise<string | null> {
  const value = String(raw ?? "").trim();
  if (!value) {
    if (required) throw new ContactError("Informe o e-mail.");
    return null;
  }
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) throw new ContactError("E-mail inválido. Confira o endereço.");
  if (!(await emailDomainAcceptsMail(parsed.data))) {
    throw new ContactError(`O domínio de ${parsed.data} não recebe e-mails. Confira o que vem depois do @.`);
  }
  return parsed.data;
}

// Telefone opcional, enviado pelo PhoneInput já em E.164 (ou como digitado, se inválido).
export function validPhone(raw: FormDataEntryValue | null, label = "Telefone"): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const e164 = toE164(value);
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

export const formatAddress = (a: {
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  address?: string | null;
}) => {
  const line1 = [a.street, a.addressNumber].filter(Boolean).join(", ");
  const parts = [line1, a.complement, a.district, [a.city, a.state].filter(Boolean).join("/"), a.cep?.replace(/^(\d{5})(\d{3})$/, "$1-$2")];
  const structured = parts.filter(Boolean).join(" · ");
  return structured || a.address || null;
};
