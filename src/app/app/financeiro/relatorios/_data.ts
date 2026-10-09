// Dados dos relatórios financeiros de um ano (só no servidor). Receitas vêm das cobranças (Charge, em reais);
// despesas, de contas a pagar (centavos). Tudo é convertido para centavos aqui.
import { db } from "@/lib/db";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { CATEGORY_GROUPS, livroCaixa, paymentOutflow, type CategoryGroup } from "@/lib/payables";

export const REPORT_VIEWS = ["cashflow", "dre", "categories", "livro"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

// Livro-Caixa é do carnê-leão (pessoa física): clínica (PJ, ou vários profissionais somados) não vê.
export const reportViewsFor = (accountType: string): readonly ReportView[] =>
  accountType === "clinica" ? REPORT_VIEWS.filter((v) => v !== "livro") : REPORT_VIEWS;

const toCents = (reais: number) => Math.round(reais * 100);
const monthOf = (d: Date) => dateKeySP(d).slice(0, 7);

export async function yearReport(workspaceId: string, year: number) {
  const start = parseDateOnly(`${year}-01-01`);
  const end = parseDateOnly(`${year + 1}-01-01`);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const today = dateKeySP();
  const currentMonth = today.slice(0, 7);
  const isCurrentYear = String(year) === today.slice(0, 4);

  const [chargesPaid, chargesDue, chargesBefore, payablesBefore, payments, payablesDue, payablesCompetence] = await Promise.all([
    db.charge.findMany({ where: { workspaceId, status: "paid", paidAt: { gte: start, lt: end } }, select: { amount: true, paidAt: true } }),
    db.charge.findMany({ where: { workspaceId, status: { notIn: ["cancelled", "refunded"] }, dueDate: { gte: start, lt: end } }, select: { amount: true, dueDate: true, status: true } }),
    // No ano corrente, o que venceu antes e segue em aberto também entra na previsão (no mês atual).
    isCurrentYear
      ? db.charge.findMany({ where: { workspaceId, status: { in: ["pending", "overdue"] }, dueDate: { lt: start } }, select: { amount: true, dueDate: true } })
      : Promise.resolve([]),
    isCurrentYear
      ? db.payable.findMany({ where: { workspaceId, cancelledAt: null, dueDate: { lt: start }, paidCents: { lt: db.payable.fields.amountCents } }, select: { amountCents: true, paidCents: true, dueDate: true } })
      : Promise.resolve([]),
    db.payablePayment.findMany({
      where: { workspaceId, reversedAt: null, paidAt: { gte: start, lt: end } },
      include: { payable: { select: { id: true, description: true, documentNumber: true, deductible: true, supplier: { select: { name: true } }, category: { select: { name: true } } } } },
      orderBy: { paidAt: "asc" },
    }),
    db.payable.findMany({ where: { workspaceId, cancelledAt: null, dueDate: { gte: start, lt: end } }, select: { amountCents: true, paidCents: true, dueDate: true } }),
    db.payable.findMany({
      where: { workspaceId, cancelledAt: null, competenceDate: { gte: start, lt: end } },
      select: { amountCents: true, competenceDate: true, category: { select: { id: true, name: true, group: true } }, supplier: { select: { id: true, name: true } } },
    }),
  ]);

  // Fluxo de caixa: realizado pelo dia do pagamento; previsto pelo vencimento do que ainda está em aberto.
  // No ano corrente, o que já venceu e segue em aberto pesa no mês atual (é lá que o dinheiro ainda vai sair ou entrar).
  const openMonth = (d: Date) => (isCurrentYear && monthOf(d) < currentMonth ? currentMonth : monthOf(d));
  const openCharges = [...chargesDue.filter((c) => c.status !== "paid"), ...chargesBefore];
  const openPayables = [...payablesDue, ...payablesBefore];
  const cashflow = months.map((m) => {
    const inPaid = chargesPaid.filter((c) => c.paidAt && monthOf(c.paidAt) === m).reduce((s, c) => s + toCents(c.amount), 0);
    const outPaid = payments.filter((p) => monthOf(p.paidAt) === m).reduce((s, p) => s + paymentOutflow(p), 0);
    const inOpen = openCharges.filter((c) => openMonth(c.dueDate) === m).reduce((s, c) => s + toCents(c.amount), 0);
    const outOpen = openPayables.filter((p) => openMonth(p.dueDate) === m).reduce((s, p) => s + Math.max(0, p.amountCents - p.paidCents), 0);
    return { month: m, inPaid, outPaid, inOpen, outOpen, net: inPaid - outPaid, projectedNet: inPaid + inOpen - outPaid - outOpen };
  });
  let acc = 0;
  let accProjected = 0;
  const cashflowRows = cashflow.map((r) => {
    acc += r.net;
    accProjected += r.projectedNet;
    return { ...r, accumulated: acc, accumulatedProjected: accProjected, future: r.month > today.slice(0, 7) };
  });

  // DRE por competência: receita pelo vencimento da cobrança; despesa pela competência da conta.
  const revenue = months.map((m) => chargesDue.filter((c) => monthOf(c.dueDate) === m).reduce((s, c) => s + toCents(c.amount), 0));
  const groups = CATEGORY_GROUPS.map((g) => ({
    group: g as CategoryGroup,
    values: months.map((m) => payablesCompetence.filter((p) => p.category.group === g && monthOf(p.competenceDate) === m).reduce((s, p) => s + p.amountCents, 0)),
  })).filter((g) => g.values.some((v) => v > 0));
  const expenses = months.map((_, i) => groups.reduce((s, g) => s + g.values[i], 0));
  const dre = { months, revenue, groups, expenses, result: months.map((_, i) => revenue[i] - expenses[i]) };

  // Despesas do ano por categoria e por fornecedor (competência).
  const byCategory = new Map<string, { name: string; group: string; cents: number }>();
  const bySupplier = new Map<string, { name: string; cents: number }>();
  for (const p of payablesCompetence) {
    const c = byCategory.get(p.category.id) ?? { name: p.category.name, group: p.category.group, cents: 0 };
    c.cents += p.amountCents;
    byCategory.set(p.category.id, c);
    if (p.supplier) {
      const s = bySupplier.get(p.supplier.id) ?? { name: p.supplier.name, cents: 0 };
      s.cents += p.amountCents;
      bySupplier.set(p.supplier.id, s);
    }
  }
  const totalExpenses = expenses.reduce((a, b) => a + b, 0);
  const categories = [...byCategory.values()].sort((a, b) => b.cents - a.cents);
  const suppliers = [...bySupplier.values()].sort((a, b) => b.cents - a.cents).slice(0, 15);

  // Livro-Caixa (regime de caixa): receitas recebidas e despesas dedutíveis pagas. Juros e multa ficam de fora;
  // o desconto reduz o custo.
  const deductiblePayments = payments.filter((p) => p.payable.deductible);
  const livro = livroCaixa(
    months.map((m) => ({
      month: m,
      incomeCents: chargesPaid.filter((c) => c.paidAt && monthOf(c.paidAt) === m).reduce((s, c) => s + toCents(c.amount), 0),
      expensesCents: deductiblePayments.filter((p) => monthOf(p.paidAt) === m).reduce((s, p) => s + p.principalCents - p.discountCents, 0),
    })),
  );
  const livroEntries = deductiblePayments.map((p) => ({
    date: dateKeySP(p.paidAt),
    description: p.payable.description,
    supplier: p.payable.supplier?.name ?? "",
    category: p.payable.category.name,
    document: p.payable.documentNumber ?? "",
    cents: p.principalCents - p.discountCents,
    payableId: p.payable.id,
  }));

  // A dedução foi cortada pela receita registrada em algum mês (receita recebida fora da Salutti fica de fora do teto).
  const livroLimited = livro.some((m) => m.carriedOutCents > 0);
  return { year, months, cashflow: cashflowRows, dre, categories, suppliers, totalExpenses, livro, livroEntries, livroLimited };
}

export type YearReport = Awaited<ReturnType<typeof yearReport>>;
