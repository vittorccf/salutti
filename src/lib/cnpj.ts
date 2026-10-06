// CNPJ numérico e alfanumérico (IN RFB 2.229/2024, emitido desde jul/2026): 12 posições com dígitos ou
// letras maiúsculas e 2 dígitos verificadores numéricos. O DV usa módulo 11 com pesos de 2 a 9, e o valor
// de cada caractere é o código ASCII menos 48 (dígitos valem 0-9; "A" vale 17).
export const normalizeCnpj = (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, "");

const dv = (base: string) => {
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += (base.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
};

export function isValidCnpj(raw: string) {
  const c = normalizeCnpj(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export const formatCnpj = (raw: string) =>
  normalizeCnpj(raw).replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/, "$1.$2.$3/$4-$5");
