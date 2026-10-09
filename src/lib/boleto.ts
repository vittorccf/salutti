// Leitura da linha digitável colada no lançamento de conta a pagar: confere os dígitos verificadores e,
// quando o padrão permite, extrai valor e vencimento para preencher o formulário.
//
// - Boleto bancário (47 dígitos, padrão FEBRABAN): 3 campos com DV módulo 10, DV geral módulo 11,
//   fator de vencimento (4) e valor em centavos (10).
// - Arrecadação/convênio (48 dígitos, começa com 8: contas de consumo e tributos): 4 blocos de 11 + DV
//   (módulo 10 ou 11, conforme o 3º dígito). O valor só existe quando o 3º dígito é 6 ou 8; não há vencimento padronizado.

export type Boleto =
  | { kind: "bancario"; barcode: string; bank: string; amountCents: number | null; dueDate: string | null }
  | { kind: "arrecadacao"; barcode: string; segment: string; amountCents: number | null; dueDate: null };

export type BoletoError = "length" | "checkDigit";

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

// Módulo 10 (pesos 2,1 da direita para a esquerda; produto de dois dígitos soma os algarismos).
export function mod10(digits: string) {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const p = Number(digits[i]) * weight;
    sum += p > 9 ? p - 9 : p;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

// Soma do módulo 11 com pesos 2..9 da direita para a esquerda.
const mod11Sum = (digits: string) => {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  return sum;
};

// DV geral do boleto bancário: 0, 10 e 11 viram 1.
export function mod11Bancario(digits: string) {
  const dv = 11 - (mod11Sum(digits) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// DV da arrecadação: resto 0 ou 1 vira 0.
export function mod11Arrecadacao(digits: string) {
  const r = mod11Sum(digits) % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

const DAY = 86_400_000;
const addDaysKey = (base: string, days: number) => new Date(Date.parse(`${base}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

// Fator de vencimento: dias desde 07/10/1997. Chegou a 9999 em 21/02/2025 e recomeçou em 1000 no dia 22/02/2025.
// O mesmo fator vale para as duas bases (com 25 anos de distância): fica a data mais próxima de hoje.
export function dueDateFromFactor(factor: number, today: string) {
  if (!factor) return null;
  const old = addDaysKey("1997-10-07", factor);
  if (factor < 1000) return old;
  const restarted = addDaysKey("2025-02-22", factor - 1000);
  const distance = (d: string) => Math.abs(Date.parse(d) - Date.parse(today));
  return distance(restarted) <= distance(old) ? restarted : old;
}

export function parseBoleto(input: string, today: string): Boleto | BoletoError {
  const d = onlyDigits(input);
  if (d.length === 47) {
    const fields = [d.slice(0, 10), d.slice(10, 21), d.slice(21, 32)];
    if (fields.some((f) => mod10(f.slice(0, -1)) !== Number(f.at(-1)))) return "checkDigit";
    const barcode = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    if (mod11Bancario(barcode.slice(0, 4) + barcode.slice(5)) !== Number(barcode[4])) return "checkDigit";
    const amount = Number(barcode.slice(9, 19));
    return {
      kind: "bancario",
      barcode,
      bank: barcode.slice(0, 3),
      amountCents: amount > 0 ? amount : null,
      dueDate: dueDateFromFactor(Number(barcode.slice(5, 9)), today),
    };
  }
  if (d.length === 48 && d[0] === "8") {
    const blocks = [0, 12, 24, 36].map((i) => d.slice(i, i + 12));
    const useMod10 = d[2] === "6" || d[2] === "7";
    const dvOf = (s: string) => (useMod10 ? mod10(s) : mod11Arrecadacao(s));
    if (blocks.some((b) => dvOf(b.slice(0, 11)) !== Number(b[11]))) return "checkDigit";
    const barcode = blocks.map((b) => b.slice(0, 11)).join("");
    if (dvOf(barcode.slice(0, 3) + barcode.slice(4)) !== Number(barcode[3])) return "checkDigit";
    const effective = d[2] === "6" || d[2] === "8";
    const amount = Number(barcode.slice(4, 15));
    return {
      kind: "arrecadacao",
      barcode,
      segment: barcode[1],
      amountCents: effective && amount > 0 ? amount : null,
      dueDate: null,
    };
  }
  return "length";
}

// "00190.00009 01234.567896 ..." para exibir: blocos legíveis da linha digitável.
export function formatLinhaDigitavel(input: string) {
  const d = onlyDigits(input);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 12, 24, 36].map((i) => `${d.slice(i, i + 11)}-${d[i + 11]}`).join(" ");
  return d;
}
