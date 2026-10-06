// Rótulos de valores guardados como código no banco (common.labels / common.status nas mensagens).
// Servidor: `const label = labeler(await getTranslations("common.labels"))`;
// cliente:  `const label = labeler(useTranslations("common.labels"))`. Uso: label("modality", appt.modality).
// Valor desconhecido volta como veio (sem sublinhados); nulo vira "-".
type Translator = { (key: string): string; has: (key: string) => boolean };

export const labeler = (t: Translator) => (group: string, value: string | number | null | undefined) => {
  if (value == null || value === "") return "-";
  const key = `${group}.${value}`;
  return t.has(key) ? t(key) : String(value).replaceAll("_", " ");
};
