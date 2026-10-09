// Guarda e consultas de contas a pagar (só no servidor).
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePayables } from "@/lib/permissions";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { addDaysKey, DEFAULT_CATEGORIES, payableStatus, type PayableStatus } from "@/lib/payables";

// Sem permissão, a tela não existe (404), como no resto do app.
export async function requirePayables() {
  const ctx = await requireContext();
  if (!canManagePayables(ctx.role)) notFound();
  return ctx;
}

// Plano de contas padrão criado no primeiro acesso (e completado se surgir categoria padrão nova).
export async function ensureDefaultCategories(workspaceId: string) {
  const existing = await db.financeCategory.count({ where: { workspaceId, systemKey: { not: null } } });
  if (existing >= DEFAULT_CATEGORIES.length) return;
  await db.financeCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ workspaceId, name: c.name, group: c.group, deductible: c.deductible, systemKey: c.key })),
    skipDuplicates: true,
  });
}

export const payableInclude = {
  supplier: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, group: true } },
  payments: true,
  _count: { select: { attachments: true } },
} satisfies Prisma.PayableInclude;

export type PayableRow = Prisma.PayableGetPayload<{ include: typeof payableInclude }>;

// Situação a partir das datas em São Paulo.
export const statusOf = (p: PayableRow, today = dateKeySP()): PayableStatus =>
  payableStatus({ amountCents: p.amountCents, dueDate: dateKeySP(p.dueDate), cancelledAt: p.cancelledAt, payments: p.payments }, today);

export const LIST_FILTERS = ["open", "overdue", "next7", "paid", "cancelled", "all"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];

export type ListParams = { status?: string; from?: string; to?: string; category?: string; supplier?: string; q?: string };

const isDateKey = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Filtros da lista (e da exportação): vencimento entre datas, categoria, fornecedor e busca na descrição/documento.
// A situação (paga, vencida...) depende dos pagamentos: o banco faz o grosso e a situação é refinada em memória.
export async function listPayables(workspaceId: string, params: ListParams) {
  const status: ListFilter = (LIST_FILTERS as readonly string[]).includes(params.status ?? "") ? (params.status as ListFilter) : "open";
  const today = dateKeySP();
  const where: Prisma.PayableWhereInput = { workspaceId };
  const due: Prisma.DateTimeFilter = {};
  if (isDateKey(params.from)) due.gte = parseDateOnly(params.from!);
  if (isDateKey(params.to)) due.lte = parseDateOnly(params.to!);
  if (status === "overdue") due.lt = parseDateOnly(today);
  if (status === "next7") {
    due.gte = parseDateOnly(today);
    due.lte = parseDateOnly(addDaysKey(today, 7));
  }
  if (Object.keys(due).length) where.dueDate = due;
  if (status === "cancelled") where.cancelledAt = { not: null };
  else if (status !== "all") where.cancelledAt = null;
  if (params.category) where.categoryId = params.category;
  if (params.supplier) where.supplierId = params.supplier;
  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { documentNumber: { contains: q, mode: "insensitive" } },
      { supplier: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await db.payable.findMany({
    where,
    include: payableInclude,
    orderBy: [{ dueDate: status === "paid" ? "desc" : "asc" }, { createdAt: "asc" }],
    take: 500,
  });
  const keep: Record<ListFilter, (s: PayableStatus) => boolean> = {
    open: (s) => s !== "paid" && s !== "cancelled",
    overdue: (s) => s === "overdue",
    next7: (s) => s !== "paid" && s !== "cancelled",
    paid: (s) => s === "paid",
    cancelled: (s) => s === "cancelled",
    all: () => true,
  };
  return { status, rows: rows.filter((r) => keep[status](statusOf(r, today))), truncated: rows.length === 500 };
}

export async function formOptions(workspaceId: string) {
  await ensureDefaultCategories(workspaceId);
  const [categories, suppliers] = await Promise.all([
    db.financeCategory.findMany({ where: { workspaceId, active: true }, orderBy: [{ group: "asc" }, { name: "asc" }] }),
    db.supplier.findMany({
      where: { workspaceId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, defaultCategoryId: true },
    }),
  ]);
  return { categories, suppliers };
}
