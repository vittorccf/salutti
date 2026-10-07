import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { canSeeClinical } from "@/lib/permissions";
import { lotStatus, openExpiresAt, roundQty } from "@/lib/stock";
import { getFormat, getTranslations } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StockBadge } from "../../_components/stock-badge";
import { formatQty, requireStock } from "../../_lib";

export const dynamic = "force-dynamic";

// Rastreabilidade: quem recebeu este lote (recall do fabricante, intercorrência, fiscalização sanitária).
export default async function LotTracePage({ params }: { params: Promise<{ lotId: string }> }) {
  const ctx = await requireStock("view");
  const { lotId } = await params;
  const lot = await db.stockLot.findFirst({
    where: { id: lotId, workspaceId: ctx.workspace.id },
    include: { product: true },
  });
  if (!lot) notFound();

  const movements = await db.stockMovement.findMany({
    where: { lotId: lot.id, workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
  });
  const uses = movements.filter((m) => m.kind === "uso");
  const clinical = canSeeClinical(ctx.role);
  const patientIds = [...new Set(uses.map((m) => m.patientId).filter((v): v is string => Boolean(v)))];
  const appointmentIds = [...new Set(uses.map((m) => m.appointmentId).filter((v): v is string => Boolean(v)))];

  const [patients, appointments, t, tu, tm, f] = await Promise.all([
    clinical && patientIds.length
      ? db.patient.findMany({ where: { id: { in: patientIds }, workspaceId: ctx.workspace.id }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
    clinical && appointmentIds.length
      ? db.appointment.findMany({ where: { id: { in: appointmentIds }, workspaceId: ctx.workspace.id }, select: { id: true, startsAt: true } })
      : Promise.resolve([]),
    getTranslations("stock.lot"),
    getTranslations("stock.units"),
    getTranslations("stock.movementKinds"),
    getFormat(),
  ]);
  const patientName = new Map(patients.map((p) => [p.id, p.fullName]));
  const sessionAt = new Map(appointments.map((a) => [a.id, a.startsAt]));
  const q = (n: number) => formatQty(f, tu, n, lot.product.unit);

  // Totais por tipo de movimentação: saídas em valor absoluto; ajuste com sinal (sobra ou falta no inventário).
  const totals = movements.reduce<Record<string, number>>((acc, m) => {
    acc[m.kind] = roundQty((acc[m.kind] ?? 0) + (m.kind === "ajuste" ? m.quantity : Math.abs(m.quantity)));
    return acc;
  }, {});
  const openLimit = openExpiresAt(lot, lot.product);
  const status = lot.quantity > 0 ? lotStatus(lot, lot.product) : "esgotado";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/app/estoque/${lot.productId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {lot.product.name}
        </Link>
        <h1 className="text-page-title mt-1 flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand" aria-hidden /> {t("title", { lot: lot.lotNumber })}
          <StockBadge status={status} />
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("product")} value={lot.product.name} hint={lot.product.anvisaRegistry ? t("anvisa", { registry: lot.product.anvisaRegistry }) : undefined} />
        <Stat
          label={t("expiresAt")}
          value={f.date(lot.expiresAt)}
          hint={lot.openedAt ? t(openLimit ? "openedUntil" : "opened", { opened: f.dateTime(lot.openedAt), until: openLimit ? f.dateTime(openLimit) : "" }) : undefined}
        />
        <Stat label={t("balance")} value={q(lot.quantity)} hint={t("received", { quantity: q(lot.initialQuantity), date: f.date(lot.receivedAt) })} />
        <Stat label={t("patients")} value={f.number(patientIds.length)} hint={t("used", { quantity: q(totals.uso ?? 0) })} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("usesTitle")}</CardTitle>
          <CardDescription>{clinical ? t("usesDescription") : t("restricted")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {uses.length === 0 ? (
            <div className="p-6 pt-0">
              <EmptyState title={t("noUsesTitle")} description={t("noUsesDescription")} />
            </div>
          ) : clinical ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t("patient")}</TH>
                  <TH>{t("date")}</TH>
                  <TH>{t("session")}</TH>
                  <TH className="text-right">{t("quantity")}</TH>
                </TR>
              </THead>
              <TBody>
                {uses.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-medium">
                      {m.patientId && patientName.has(m.patientId) ? (
                        <Link href={`/app/pacientes/${m.patientId}`} className="hover:underline underline-offset-4">
                          {patientName.get(m.patientId)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("noPatient")}</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{f.dateTime(m.createdAt)}</TD>
                    <TD className="whitespace-nowrap">
                      {m.appointmentId ? (
                        <Link href={`/app/agenda/${m.appointmentId}`} className="text-brand hover:underline underline-offset-4">
                          {sessionAt.has(m.appointmentId) ? f.dateTime(sessionAt.get(m.appointmentId)!) : t("openSession")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-right">{q(Math.abs(m.quantity))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-6 pb-6 text-sm">{t("usesCount", { count: uses.length, patients: patientIds.length })}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            {(["entrada", "uso", "perda", "venda", "ajuste"] as const).map((k) => (
              <div key={k} className="rounded-md border p-3">
                <dt className="text-muted-foreground">{tm(k)}</dt>
                <dd className="mt-1 font-medium tabular-nums">{q(totals[k] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Card>
    <CardContent className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </CardContent>
  </Card>
);
