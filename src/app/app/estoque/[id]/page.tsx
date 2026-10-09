import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageOpen, Pencil, Users } from "lucide-react";
import { db } from "@/lib/db";
import { canSeeClinical } from "@/lib/permissions";
import { dateKeySP } from "@/lib/dates";
import { lotStatus, openExpiresAt, productSummary } from "@/lib/stock";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StockBadge } from "../_components/stock-badge";
import { countLotAction, lotOutAction, openLotAction, receiveLotAction } from "../_actions";
import { canManageStock, formatQty, LOSS_REASONS, requireStock, unitLabel } from "../_lib";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStock("view");
  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { lots: { orderBy: [{ quantity: "desc" }, { expiresAt: "asc" }] } },
  });
  if (!product) notFound();

  const movements = await db.stockMovement.findMany({
    where: { productId: product.id, workspaceId: ctx.workspace.id },
    include: { lot: { select: { id: true, lotNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const clinical = canSeeClinical(ctx);
  const patientIds = [...new Set(movements.map((m) => m.patientId).filter((v): v is string => Boolean(v)))];
  const userIds = [...new Set(movements.map((m) => m.userId).filter((v): v is string => Boolean(v)))];
  const [patients, users, t, tk, tu, tm, tr, f] = await Promise.all([
    clinical && patientIds.length
      ? db.patient.findMany({ where: { id: { in: patientIds }, workspaceId: ctx.workspace.id }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    getTranslations("stock.detail"),
    getTranslations("stock.kinds"),
    getTranslations("stock.units"),
    getTranslations("stock.movementKinds"),
    getTranslations("stock.reasons"),
    getFormat(),
  ]);
  const patientName = new Map(patients.map((p) => [p.id, p.fullName]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const now = new Date();
  const summary = productSummary(product.lots, product, now);
  const canManage = canManageStock(ctx);
  const q = (n: number) => formatQty(f, tu, n, product.unit);
  const withBalance = product.lots.filter((l) => l.quantity > 0);
  const lotOption = (l: (typeof product.lots)[number]) =>
    t("lotOption", { lot: l.lotNumber, date: f.date(l.expiresAt), quantity: q(l.quantity) });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/app/estoque" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
          </Link>
          <h1 className="text-page-title mt-1 flex flex-wrap items-center gap-2">
            {product.name}
            {product.active ? <StockBadge status={summary.status} /> : <StockBadge status="inativo" />}
            {product.active && summary.low && summary.status !== "baixo" ? <StockBadge status="baixo" /> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[product.brand, tk(product.kind), t("balanceLine", { quantity: q(summary.total) })].filter(Boolean).join(" · ")}
          </p>
        </div>
        {canManage ? (
          <Button variant="outline" asChild>
            <Link href={`/app/estoque/${product.id}/editar`}>
              <Pencil className="h-4 w-4" aria-hidden /> {t("edit")}
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("lots")}</CardTitle>
              <CardDescription>{t("lotsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {product.lots.length === 0 ? (
                <div className="p-6 pt-0">
                  <EmptyState icon={<PackageOpen className="h-6 w-6" aria-hidden />} title={t("noLotsTitle")} description={t("noLotsDescription")} />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("lotNumber")}</TH>
                      <TH className="text-right">{t("expiresAt")}</TH>
                      <TH className="text-right">{t("balance")}</TH>
                      <TH>{t("opened")}</TH>
                      <TH>{t("status")}</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {product.lots.map((l) => {
                      const openLimit = openExpiresAt(l, product);
                      const status = l.quantity > 0 ? lotStatus(l, product, now) : "esgotado";
                      return (
                        <TR key={l.id} className={l.quantity > 0 ? undefined : "text-muted-foreground"}>
                          <TD className="font-medium">
                            {l.lotNumber}
                            {l.supplier ? <span className="block text-xs font-normal text-muted-foreground">{l.supplier}</span> : null}
                          </TD>
                          <TD className="whitespace-nowrap text-right">{f.date(l.expiresAt)}</TD>
                          <TD className="whitespace-nowrap text-right">
                            {q(l.quantity)}
                            <span className="block text-xs text-muted-foreground">{t("ofInitial", { quantity: f.number(l.initialQuantity) })}</span>
                          </TD>
                          <TD className="whitespace-nowrap text-sm">
                            {l.openedAt ? (
                              <>
                                {f.dateTime(l.openedAt)}
                                {openLimit ? (
                                  <span className="block text-xs text-muted-foreground">{t("openUntil", { date: f.dateTime(openLimit) })}</span>
                                ) : null}
                              </>
                            ) : canManage && product.openShelfLifeHours && l.quantity > 0 ? (
                              <form action={openLotAction}>
                                <input type="hidden" name="lotId" value={l.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  {t("markOpened")}
                                </Button>
                              </form>
                            ) : (
                              "—"
                            )}
                          </TD>
                          <TD>
                            <StockBadge status={status} />
                          </TD>
                          <TD className="text-right">
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/app/estoque/lote/${l.id}`}>
                                <Users className="h-4 w-4" aria-hidden /> {t("trace")}
                              </Link>
                            </Button>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("history")}</CardTitle>
              <CardDescription>{t("historyDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noHistory")}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("date")}</TH>
                      <TH>{t("movement")}</TH>
                      <TH className="text-right">{t("quantity")}</TH>
                      <TH>{t("lot")}</TH>
                      <TH>{t("patient")}</TH>
                      <TH>{t("user")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {movements.map((m) => (
                      <TR key={m.id}>
                        <TD className="whitespace-nowrap">
                          {m.appointmentId ? (
                            <Link href={`/app/agenda/${m.appointmentId}`} className="hover:underline underline-offset-4">
                              {f.dateTime(m.createdAt)}
                            </Link>
                          ) : (
                            f.dateTime(m.createdAt)
                          )}
                        </TD>
                        <TD>
                          {tm.has(m.kind) ? tm(m.kind) : m.kind}
                          {m.reason ? (
                            <span className="block text-xs text-muted-foreground">{tr.has(m.reason) ? tr(m.reason) : m.reason}</span>
                          ) : null}
                        </TD>
                        <TD className={`whitespace-nowrap text-right ${m.quantity > 0 ? "text-success-strong" : ""}`}>
                          {m.quantity > 0 ? "+" : "−"}
                          {q(Math.abs(m.quantity))}
                        </TD>
                        <TD>
                          {m.lot ? (
                            <Link href={`/app/estoque/lote/${m.lot.id}`} className="hover:underline underline-offset-4">
                              {m.lot.lotNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD>
                          {!m.patientId ? (
                            "—"
                          ) : clinical && patientName.has(m.patientId) ? (
                            <Link href={`/app/pacientes/${m.patientId}`} className="hover:underline underline-offset-4">
                              {patientName.get(m.patientId)}
                            </Link>
                          ) : (
                            <Badge variant="muted">{t("patientHidden")}</Badge>
                          )}
                        </TD>
                        <TD className="text-muted-foreground">{(m.userId && userName.get(m.userId)) || "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t("receiveTitle")}</CardTitle>
                  <CardDescription>{t("receiveDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ActionForm action={receiveLotAction} className="space-y-3">
                    <input type="hidden" name="productId" value={product.id} />
                    <div className="space-y-1">
                      <Label htmlFor="lotNumber">{t("lotNumber")}</Label>
                      <Input id="lotNumber" name="lotNumber" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="expiresAt">{t("expiresAt")}</Label>
                        <Input id="expiresAt" name="expiresAt" type="date" required min={dateKeySP(now)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="quantity">{t("quantityIn", { unit: unitLabel(f, tu, product.unit, 2) })}</Label>
                        <Input id="quantity" name="quantity" inputMode="decimal" required placeholder="0" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="unitCost">{t("unitCost")}</Label>
                        <Input
                          id="unitCost"
                          name="unitCost"
                          inputMode="decimal"
                          placeholder={product.unitCost !== null ? String(product.unitCost).replace(".", ",") : "0,00"}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lotSupplier">{t("supplier")}</Label>
                        <Input id="lotSupplier" name="supplier" placeholder={product.supplier ?? ""} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="notes">{t("notes")}</Label>
                      <Textarea id="notes" name="notes" className="min-h-[64px]" />
                    </div>
                    <Button type="submit" className="w-full">
                      {t("receive")}
                    </Button>
                  </ActionForm>
                </CardContent>
              </Card>

              {product.lots.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("countTitle")}</CardTitle>
                    <CardDescription>{t("countDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ActionForm action={countLotAction} className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="countLot">{t("lot")}</Label>
                        <Select id="countLot" name="lotId" required>
                          {product.lots.map((l) => (
                            <option key={l.id} value={l.id}>
                              {lotOption(l)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="counted">{t("counted")}</Label>
                        <Input id="counted" name="counted" inputMode="decimal" required placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="countReason">{t("countReason")}</Label>
                        <Input id="countReason" name="reason" maxLength={120} />
                      </div>
                      <Button type="submit" variant="outline" className="w-full">
                        {t("saveCount")}
                      </Button>
                    </ActionForm>
                  </CardContent>
                </Card>
              ) : null}

              {withBalance.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{product.kind === "revenda" ? t("outTitle") : t("outTitleLoss")}</CardTitle>
                    <CardDescription>{product.kind === "revenda" ? t("outDescriptionResale") : t("outDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ActionForm action={lotOutAction} className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="outLot">{t("lot")}</Label>
                        <Select id="outLot" name="lotId" required>
                          {withBalance.map((l) => (
                            <option key={l.id} value={l.id}>
                              {lotOption(l)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {product.kind === "revenda" ? (
                        <div className="space-y-1">
                          <Label htmlFor="outKind">{t("outKind")}</Label>
                          <Select id="outKind" name="kind" defaultValue="venda">
                            <option value="venda">{tm("venda")}</option>
                            <option value="perda">{tm("perda")}</option>
                          </Select>
                        </div>
                      ) : (
                        <input type="hidden" name="kind" value="perda" />
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="outQuantity">{t("quantityOut")}</Label>
                          <Input id="outQuantity" name="quantity" inputMode="decimal" required placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="outReason">{t("reason")}</Label>
                          <Select id="outReason" name="reason" defaultValue="">
                            <option value="">{product.kind === "revenda" ? t("reasonSale") : t("reasonPick")}</option>
                            {LOSS_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {tr(r)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <Button type="submit" variant="outline" className="w-full">
                        {t("saveOut")}
                      </Button>
                    </ActionForm>
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("infoTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Info label={t("anvisaRegistry")} value={product.anvisaRegistry ?? t("notInformed")} />
                <Info label={t("supplier")} value={product.supplier ?? t("notInformed")} />
                <Info label={t("unitCost")} value={product.unitCost !== null ? f.money(product.unitCost) : t("notInformed")} />
                <Info label={t("minStock")} value={product.minStock > 0 ? q(product.minStock) : t("notInformed")} />
                <Info
                  label={t("openShelfLife")}
                  value={product.openShelfLifeHours ? t("hours", { count: product.openShelfLifeHours }) : t("notApplicable")}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{value}</dd>
  </div>
);
