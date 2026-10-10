// Leitura de campos de formulário da Odonto (texto aparado, valor em reais, data AAAA-MM-DD), num lugar só.
export const str = (fd: FormData, k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);

// "1.234,56" ou "1234.56" → 1234.56; vazio ou fora de 0 a 10 milhões → null.
export const money = (raw: string) => {
  const v = Number(raw.replace(/\./g, "").replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 10_000_000 ? Math.round(v * 100) / 100 : null;
};

export const dateKeyOf = (raw: string) => (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);
