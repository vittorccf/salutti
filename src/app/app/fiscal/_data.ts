// Dados fiscais por mês (só no servidor): rendimentos recebidos, livro-caixa e INSS pagos, folha para o fator R.
// Tudo por data de pagamento (regime de caixa, como no carnê-leão), no fuso de São Paulo.
import { db } from "@/lib/db";
import { isValidCpf } from "@/lib/cpf";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { addMonthsKey, livroCaixa, paymentOutflow } from "@/lib/payables";
import type { ReceiptRow } from "@/lib/tax";

const monthRange = (monthKey: string) => ({ gte: parseDateOnly(`${monthKey}-01`), lt: parseDateOnly(addMonthsKey(`${monthKey}-01`, 1)) });
const yearRange = (year: number) => ({ gte: parseDateOnly(`${year}-01-01`), lt: parseDateOnly(`${year + 1}-01-01`) });

const patientSelect = { id: true, fullName: true, cpf: true, responsibleName: true, responsibleCpf: true } as const;
type PayerPatient = { fullName: string; cpf: string | null; responsibleName: string | null; responsibleCpf: string | null };

// Quem pagou: o responsável, quando tem CPF cadastrado (menor de idade), e aí o paciente vira o beneficiário; senão o
// próprio paciente.
export function payerOf(p: PayerPatient) {
  if (p.responsibleCpf && isValidCpf(p.responsibleCpf)) return { payerName: p.responsibleName || p.fullName, payerCpf: p.responsibleCpf, beneficiaryCpf: p.cpf };
  return { payerName: p.fullName, payerCpf: p.cpf, beneficiaryCpf: null };
}
export const payerReady = (p: PayerPatient) => isValidCpf(payerOf(p).payerCpf);

export const receiptRow = (c: { amount: number; paidAt: Date | null; patient: PayerPatient }, description: string): ReceiptRow => ({
  paidKey: dateKeySP(c.paidAt!),
  amount: c.amount,
  description,
  ...payerOf(c.patient),
});

// Pagamentos de despesas (não estornados) num intervalo, com a categoria e a data.
async function payments(workspaceId: string, paidAt: { gte: Date; lt: Date }) {
  return db.payablePayment.findMany({
    where: { workspaceId, paidAt, reversedAt: null, payable: { cancelledAt: null } },
    select: { paidAt: true, principalCents: true, interestCents: true, fineCents: true, discountCents: true, payable: { select: { deductible: true, category: { select: { systemKey: true, group: true } } } } },
  });
}
type Pay = Awaited<ReturnType<typeof payments>>[number];
const isBook = (p: Pay) => p.payable.deductible && p.payable.category.systemKey !== "inss_individual";
const isInss = (p: Pay) => p.payable.category.systemKey === "inss_individual";

// Mês do carnê-leão. O livro-caixa que passa do rendimento de um mês fica para os meses seguintes do mesmo ano, por
// isso a conta parte de janeiro: "livroCaixa" é o que deduz neste mês (despesas do mês + excedente que chegou).
export async function monthFiscal(workspaceId: string, monthKey: string) {
  const range = monthRange(monthKey);
  const yearStart = parseDateOnly(`${monthKey.slice(0, 4)}-01-01`);
  const [charges, pays, priorIncome] = await Promise.all([
    db.charge.findMany({
      where: { workspaceId, status: "paid", paidAt: range },
      select: { id: true, amount: true, paidAt: true, patient: { select: patientSelect }, receipt: { select: { id: true, receiptNumber: true, receitaSaudeStatus: true } } },
      orderBy: { paidAt: "asc" },
    }),
    payments(workspaceId, { gte: yearStart, lt: range.lt }),
    db.charge.findMany({ where: { workspaceId, status: "paid", paidAt: { gte: yearStart, lt: range.gte } }, select: { amount: true, paidAt: true } }),
  ]);
  const months = Array.from({ length: Number(monthKey.slice(5, 7)) }, (_, i) => `${monthKey.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`);
  const inMonth = (d: Date | null, m: string) => !!d && dateKeySP(d).startsWith(m);
  const income = Math.round(charges.reduce((s, c) => s + c.amount * 100, 0)) / 100;
  const book = livroCaixa(
    months.map((m) => ({
      month: m,
      incomeCents: m === monthKey ? Math.round(income * 100) : Math.round(priorIncome.filter((c) => inMonth(c.paidAt, m)).reduce((s, c) => s + c.amount * 100, 0)),
      expensesCents: pays.filter((p) => isBook(p) && inMonth(p.paidAt, m)).reduce((s, p) => s + paymentOutflow(p), 0),
    })),
  ).at(-1)!;
  const monthPays = pays.filter((p) => inMonth(p.paidAt, monthKey));
  return {
    charges,
    income,
    expenses: book.expensesCents / 100,
    carriedIn: book.carriedInCents / 100,
    carriedOut: book.carriedOutCents / 100,
    // Despesas do mês + excedente que veio (a dedução efetiva fica limitada ao rendimento em carneLeao()).
    livroCaixa: (book.expensesCents + book.carriedInCents) / 100,
    inss: monthPays.filter(isInss).reduce((s, p) => s + paymentOutflow(p), 0) / 100,
    missingCpf: charges.filter((c) => !payerReady(c.patient)),
  };
}

// Fator R: receita (cobranças pagas) e folha (pagamentos do grupo "pessoal": salários, pró-labore, encargos) em 12 meses.
export async function factorRData(workspaceId: string, endMonthKey: string) {
  const range = { gte: parseDateOnly(addMonthsKey(`${endMonthKey}-01`, -11)), lt: parseDateOnly(addMonthsKey(`${endMonthKey}-01`, 1)) };
  const [rev, pays] = await Promise.all([
    db.charge.aggregate({ where: { workspaceId, status: "paid", paidAt: range }, _sum: { amount: true } }),
    payments(workspaceId, range),
  ]);
  const payroll = pays.filter((p) => p.payable.category.group === "pessoal").reduce((s, p) => s + paymentOutflow(p), 0) / 100;
  return { revenue12: rev._sum.amount ?? 0, payroll12: payroll };
}

// Pagamentos do paciente no ano (informe anual), mês a mês.
export async function patientYear(workspaceId: string, patientId: string, year: number) {
  const charges = await db.charge.findMany({
    where: { workspaceId, patientId, status: "paid", paidAt: yearRange(year) },
    select: { amount: true, paidAt: true },
    orderBy: { paidAt: "asc" },
  });
  return charges;
}

// Rendimentos do ano inteiro (para o CSV anual).
export async function yearCharges(workspaceId: string, year: number) {
  return db.charge.findMany({
    where: { workspaceId, status: "paid", paidAt: yearRange(year) },
    select: { id: true, amount: true, paidAt: true, patient: { select: patientSelect }, receipt: { select: { receitaSaudeStatus: true } } },
    orderBy: { paidAt: "asc" },
  });
}
