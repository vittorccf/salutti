// Erros de validação que viram mensagem para a pessoa, no idioma dela. As libs lançam a chave
// (common.errors.*) e as Server Actions traduzem aqui: `return { erro: await errorMessage(e) }`.
import { getTranslations } from "next-intl/server";

export class TranslatableError extends Error {
  constructor(
    public key: string,
    public values?: Record<string, string>,
  ) {
    super(key);
  }
}

export async function errorMessage(e: TranslatableError) {
  const t = await getTranslations("common.errors");
  const values = { ...e.values };
  if (values.label && t.has(values.label)) values.label = t(values.label);
  return t.has(e.key) ? t(e.key, values) : e.key;
}
