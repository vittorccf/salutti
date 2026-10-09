// CPF: só dígitos, conferência dos dois dígitos verificadores e formatação 000.000.000-00.
export const cpfDigits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export function isValidCpf(value: string | null | undefined) {
  const d = cpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export const formatCpf = (value: string | null | undefined) => {
  const d = cpfDigits(value);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (value ?? "");
};
