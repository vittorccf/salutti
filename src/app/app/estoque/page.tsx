import Link from "next/link";
import { AlertTriangle, Package, PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { productSummary, stockAlerts } from "@/lib/stock";
import { getFormat, getTranslations } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StockBadge } from "./_components/stock-badge";
import { canManageStock, canViewStockDetail, formatQty, requireStock } from "./_lib";

export const dynamic = "force-dynamic";

const KIND_FILTERS = ["todos", "insumo", "revenda"] as const;
const STATUS_FILTERS = ["todas", "alertas", "baixo", "vencendo", "vencido"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Um produto pode ter lote vencido e outro vencendo: o filtro olha cada situação, não só a mais grave.
const matchesStatus = (filter: StatusFilter, s: { low: boolean; expiring: boolean; expired: boolean }) =>
  filter === "todas" ||
  (filter === "alertas" && (s.low || s.expiring || s.expired)) ||
  (filter === "baixo" && s.low) ||
  (filter === "vencendo" && s.expiring) ||
  (filter === "vencido" && s.expired);

export default async function StockPage({ searchParams }: { searchParams: Promise<{ tipo?: string; situacao?: string }> }) {
  const ctx = await requireStock("list");
  const sp = await searchParams;
  const tipo: KindFilter = (KIND_FILTERS as readonly string[]).includes(sp.tipo ?? "") ? (sp.tipo as KindFilter) : "todos";
  const situacao: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(sp.situacao ?? "")
    ? (sp.situacao as StatusFilter)
    : "todas";
  const now = new Date();

  const [products, alerts, t, tk, tu, f] = await Promise.all([
    db.product.findMany({
      where: { workspaceId: ctx.workspace.id, ...(tipo !== "todos" ? { kind: tipo } : {}) },
      include: { lots: { where: { quantity: { gt: 0 } } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    stockAlerts(ctx.workspace.id, now),
    getTranslations("stock.list"),
    getTranslations("stock.kinds"),
    getTranslations("stock.units"),
    getFormat(),
  ]);
  const ta = await getTranslations("stock.alerts");
  const canManage = canManageStock(ctx.role);
  const canOpen = canViewStockDetail(ctx.role);

  const rows = products
    .map((p) => ({ p, s: productSummary(p.lots, p, now) }))
    .filter(({ p, s }) => situacao === "todas" || (p.active && matchesStatus(situacao, s)));
  const lotAlerts = alerts.lots;
  const alertCount = alerts.low.length + lotAlerts.length;

  const qs = (next: { tipo?: KindFilter; situacao?: StatusFilter }) => {
    const params = new URLSearchParams();
    const k = next.tipo ?? tipo;
    const s = next.situacao ?? situacao;
    if (k !== "todos") params.set("tipo", k);
    if (s !== "todas") params.set("situacao", s);
    const str = params.toString();
    return `/app/estoque${str ? `?${str}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      active ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Package className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/app/estoque/novo">
              <PlusCircle className="h-4 w-4" aria-hidden /> {t("newProduct")}
            </Link>
          </Button>
        ) : null}
      </header>

      {alertCount > 0 ? (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning-strong" aria-hidden /> {ta("title", { count: alertCount })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm md:grid-cols-2">
              {alerts.low.map((a) => (
                <li key={`low-${a.productId}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <span className="min-w-0">
                    <AlertLink href={canOpen ? `/app/estoque/${a.productId}` : null}>{a.name}</AlertLink>
                    <span className="block text-xs text-muted-foreground">
                      {ta("lowDetail", { total: formatQty(f, tu, a.total, a.unit), min: formatQty(f, tu, a.minStock, a.unit) })}
                    </span>
                  </span>
                  <StockBadge status="baixo" />
                </li>
              ))}
              {lotAlerts.map((a) => (
                <li key={`lot-${a.lotId}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <span className="min-w-0">
                    <AlertLink href={canOpen ? `/app/estoque/${a.productId}` : null}>{a.name}</AlertLink>
                    <span className="block text-xs text-muted-foreground">
                      {ta(a.status === "aberto_vencido" ? "openExpiredDetail" : a.status === "vencido" ? "expiredDetail" : "expiringDetail", {
                        lot: a.lotNumber,
                        date: f.date(a.expiresAt),
                        quantity: formatQty(f, tu, a.quantity, a.unit),
                      })}
                    </span>
                  </span>
                  <StockBadge status={a.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <nav aria-label={t("filters")} className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-overline text-muted-foreground">{t("filterKind")}</span>
          {KIND_FILTERS.map((k) => (
            <Link key={k} href={qs({ tipo: k })} className={chip(tipo === k)} aria-current={tipo === k ? "page" : undefined}>
              {t(`kindFilter.${k}`)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-overline text-muted-foreground">{t("filterStatus")}</span>
          {STATUS_FILTERS.map((s) => (
            <Link key={s} href={qs({ situacao: s })} className={chip(situacao === s)} aria-current={situacao === s ? "page" : undefined}>
              {t(`statusFilter.${s}`)}
            </Link>
          ))}
        </div>
      </nav>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 && tipo === "todos" ? (
            <div className="p-6">
              <EmptyState
                icon={<Package className="h-6 w-6" aria-hidden />}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                action={
                  canManage ? (
                    <Button asChild>
                      <Link href="/app/estoque/novo">{t("newProduct")}</Link>
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("emptyFilteredTitle")} description={t("emptyFilteredDescription")} />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("product")}</TH>
                  <TH>{t("kind")}</TH>
                  <TH className="text-right">{t("balance")}</TH>
                  <TH className="text-right">{t("minStock")}</TH>
                  <TH className="text-right">{t("nextExpiry")}</TH>
                  <TH>{t("status")}</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map(({ p, s }) => (
                  <TR key={p.id} className={p.active ? undefined : "text-muted-foreground"}>
                    <TD>
                      {canOpen ? (
                        <Link href={`/app/estoque/${p.id}`} className="font-medium hover:underline underline-offset-4">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{p.name}</span>
                      )}
                      {p.brand ? <span className="block text-xs text-muted-foreground">{p.brand}</span> : null}
                    </TD>
                    <TD>{tk(p.kind)}</TD>
                    <TD className="whitespace-nowrap text-right">{formatQty(f, tu, s.total, p.unit)}</TD>
                    <TD className="whitespace-nowrap text-right">{p.minStock > 0 ? formatQty(f, tu, p.minStock, p.unit) : "—"}</TD>
                    <TD className="whitespace-nowrap text-right">{s.nextExpiry ? f.date(s.nextExpiry) : "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {!p.active ? (
                          <StockBadge status="inativo" />
                        ) : (
                          <>
                            <StockBadge status={s.status} />
                            {s.low && s.status !== "baixo" ? <StockBadge status="baixo" /> : null}
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const AlertLink = ({ href, children }: { href: string | null; children: React.ReactNode }) =>
  href ? (
    <Link href={href} className="block truncate font-medium hover:underline underline-offset-4">
      {children}
    </Link>
  ) : (
    <span className="block truncate font-medium">{children}</span>
  );
