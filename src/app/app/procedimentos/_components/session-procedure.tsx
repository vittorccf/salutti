// Sessão da Salutti Estética (/app/agenda/[id]): procedimento, termo de consentimento, registro do que foi
// aplicado (baixa de estoque por lote, FEFO sugerido), custo de insumos e margem, retorno sugerido.
import { createHash } from "node:crypto";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, FileText, Syringe, Undo2 } from "lucide-react";
import type { Appointment } from "@prisma/client";
import { db } from "@/lib/db";
import { fefoOrder } from "@/lib/stock";
import { isProcedureCategory, quantityInput, returnDate, returnStartsAtLocal, sessionMargin, suppliesCost } from "@/lib/procedures";
import { getFormat, getLocale, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { acceptConsentAction, recordProcedureAction, reverseProcedureAction } from "../_actions";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export async function SessionProcedure({ appt, recorded, reversed }: { appt: Appointment; recorded: boolean; reversed: boolean }) {
  if (!appt.procedureId) return null;
  const workspaceId = appt.workspaceId;
  const procedure = await db.procedure.findFirst({
    where: { id: appt.procedureId, workspaceId },
    include: { supplies: { include: { product: true } } },
  });
  if (!procedure) return null;
  const [t, tc, f, locale] = await Promise.all([
    getTranslations("aesthetics.session"),
    getTranslations("aesthetics.categories"),
    getFormat(),
    getLocale(),
  ]);

  const [uses, consent] = await Promise.all([
    db.stockMovement.findMany({
      where: { workspaceId, appointmentId: appt.id, kind: { in: ["uso", "estorno"] } },
      include: { lot: true, product: true },
      orderBy: { createdAt: "asc" },
    }),
    procedure.consentText
      ? db.consentRecord.findFirst({
          where: {
            workspaceId,
            patientId: appt.patientId,
            purpose: "procedimento",
            granted: true,
            revokedAt: null,
            documentHash: sha256(procedure.consentText),
          },
          orderBy: { grantedAt: "desc" },
        })
      : null,
  ]);

  // Lotes válidos (não vencidos, com saldo) de cada produto, na ordem FEFO, para a escolha manual de lote.
  const isRecorded = appt.procedureRecordedAt !== null;
  const products =
    !isRecorded
      ? await db.product.findMany({
          where: { workspaceId, OR: [{ active: true }, { id: { in: procedure.supplies.map((s) => s.productId) } }] },
          include: { lots: { where: { quantity: { gt: 0 } } } },
          orderBy: { name: "asc" },
        })
      : [];
  const validLots = new Map(products.map((p) => [p.id, fefoOrder(p.lots, p)]));
  const lotLabel = (l: { lotNumber: string; expiresAt: Date; quantity: number }, unit: string) =>
    t("lotOption", { lot: l.lotNumber, date: f.date(l.expiresAt), quantity: f.number(l.quantity), unit });

  // Custo líquido: o que saiu menos o que voltou por estorno.
  const costOf = (kind: string) =>
    suppliesCost(
      uses
        .filter((u) => u.kind === kind)
        .map((u) => ({ quantity: u.quantity, lotUnitCost: u.lot?.unitCost ?? null, productUnitCost: u.product.unitCost })),
    );
  const cost = Math.round((costOf("uso") - costOf("estorno")) * 100) / 100;
  const margin = sessionMargin(appt.price, cost);
  const returnAt = procedure.returnDays ? returnDate(appt.startsAt, procedure.returnDays) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Syringe className="h-5 w-5 text-brand" aria-hidden /> {t("procedure")}: {procedure.name}
            </CardTitle>
            <CardDescription>
              {isProcedureCategory(procedure.category) ? tc(procedure.category) : procedure.category} ·{" "}
              {procedure.returnDays ? t("returnEvery", { days: procedure.returnDays }) : t("noReturn")}
            </CardDescription>
          </div>
          <Button variant="link" asChild>
            <Link href={`/app/procedimentos/${procedure.id}`}>{t("editProcedure")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-brand" aria-hidden /> {t("consentTitle")}
          </h3>
          {procedure.consentText ? (
            <>
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer text-brand">{t("consentTitle")}</summary>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{procedure.consentText}</p>
              </details>
              {consent ? (
                <p className="flex items-center gap-2 text-sm text-success-strong">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> {t("consentAccepted", { date: f.dateTime(consent.grantedAt) })}
                </p>
              ) : (
                <form action={acceptConsentAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="appointmentId" value={appt.id} />
                  <p className="text-sm text-muted-foreground">{t("consentPending")}</p>
                  <Button type="submit" variant="outline" size="sm">
                    <ClipboardCheck className="h-4 w-4" aria-hidden /> {t("consentAccept")}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("consentEmpty")}</p>
          )}
        </CardContent>
      </Card>

      {reversed ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("reversedNotice")}
        </p>
      ) : null}

      {!isRecorded ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("recordTitle")}</CardTitle>
            <CardDescription>{t("recordDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={recordProcedureAction} className="space-y-4">
              <input type="hidden" name="appointmentId" value={appt.id} />
              {procedure.supplies.length === 0 ? <p className="text-sm text-muted-foreground">{t("kitEmpty")}</p> : null}
              {procedure.supplies.map((s, i) => {
                const lots = validLots.get(s.productId) ?? [];
                return (
                  <fieldset key={s.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_8rem_1fr] sm:items-end">
                    <legend className="sr-only">{s.product.name}</legend>
                    <input type="hidden" name="product" value={s.productId} />
                    <div className="space-y-1">
                      <span className="block text-xs text-muted-foreground">{t("product")}</span>
                      <p className="text-sm font-medium">{s.product.name}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`quantity-${i}`} className="block text-xs text-muted-foreground">
                        {t("quantity")} ({s.product.unit})
                      </Label>
                      <Input id={`quantity-${i}`} name="quantity" inputMode="decimal" defaultValue={quantityInput(s.quantity, locale)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`lot-${i}`} className="block text-xs text-muted-foreground">
                        {t("lot")}
                      </Label>
                      <Select id={`lot-${i}`} name="lot" defaultValue="">
                        <option value="">{lots.length ? t("lotAuto") : t("noValidLots")}</option>
                        {lots.map((l) => (
                          <option key={l.id} value={l.id}>
                            {lotLabel(l, s.product.unit)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </fieldset>
                );
              })}
              {/* Insumo fora do kit (opcional): uma linha livre. */}
              <fieldset className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[1fr_8rem_1fr] sm:items-end">
                <legend className="px-1 text-xs text-muted-foreground">{t("extraProduct")}</legend>
                <div className="space-y-1">
                  <Label htmlFor="extra-product" className="block text-xs text-muted-foreground">
                    {t("product")}
                  </Label>
                  <Select id="extra-product" name="product" defaultValue="">
                    <option value="">-</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="extra-quantity" className="block text-xs text-muted-foreground">
                    {t("quantity")}
                  </Label>
                  <Input id="extra-quantity" name="quantity" inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="extra-lot" className="block text-xs text-muted-foreground">
                    {t("lot")}
                  </Label>
                  <Select id="extra-lot" name="lot" defaultValue="">
                    <option value="">{t("lotAuto")}</option>
                    {products
                      .filter((p) => (validLots.get(p.id) ?? []).length > 0)
                      .map((p) => (
                        <optgroup key={p.id} label={p.name}>
                          {(validLots.get(p.id) ?? []).map((l) => (
                            <option key={l.id} value={l.id}>
                              {lotLabel(l, p.unit)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </Select>
                </div>
              </fieldset>
              {/* Ficha técnica: diluição, pontos e unidades por região; intercorrência, se houver. */}
              <div className="space-y-1">
                <Label htmlFor="procedureDetails">{t("details")}</Label>
                <Textarea id="procedureDetails" name="procedureDetails" rows={3} maxLength={4000} placeholder={t("detailsPlaceholder")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="procedureAdverseEvent">{t("adverse")}</Label>
                <Textarea id="procedureAdverseEvent" name="procedureAdverseEvent" rows={2} maxLength={4000} placeholder={t("adversePlaceholder")} />
              </div>
              {procedure.consentText && !consent ? (
                <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning-strong">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t("consentMissingWarning")}
                </p>
              ) : null}
              <Button type="submit">
                <Syringe className="h-4 w-4" aria-hidden /> {t("recordSubmit")}
              </Button>
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("appliedTitle")}</CardTitle>
            {recorded ? (
              <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
                {t("recorded")}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 p-0 pb-6">
            <Table>
              <THead>
                <TR>
                  <TH>{t("product")}</TH>
                  <TH>{t("lot")}</TH>
                  <TH>{t("expires")}</TH>
                  <TH className="text-right">{t("quantity")}</TH>
                </TR>
              </THead>
              <TBody>
                {uses.map((u) => (
                  <TR key={u.id} className={u.kind === "estorno" ? "text-muted-foreground" : undefined}>
                    <TD>
                      {u.product.name}
                      {u.kind === "estorno" ? <Badge variant="muted" className="ml-2">{t("reversedBadge")}</Badge> : null}
                    </TD>
                    <TD>{u.lot?.lotNumber ?? "-"}</TD>
                    <TD>{u.lot ? f.date(u.lot.expiresAt) : "-"}</TD>
                    <TD className="text-right whitespace-nowrap">
                      {u.kind === "estorno" ? "+" : ""}
                      {f.number(Math.abs(u.quantity))} {u.product.unit}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {appt.procedureDetails || appt.procedureAdverseEvent ? (
              <dl className="space-y-3 px-6 text-sm">
                {appt.procedureDetails ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("details")}</dt>
                    <dd className="whitespace-pre-wrap">{appt.procedureDetails}</dd>
                  </div>
                ) : null}
                {appt.procedureAdverseEvent ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("adverse")}</dt>
                    <dd className="whitespace-pre-wrap">{appt.procedureAdverseEvent}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {/* Valores ficam recolhidos: a tela da sessão costuma ficar aberta na frente da paciente. */}
            <details className="mx-6 rounded-md border p-3">
              <summary className="cursor-pointer text-sm text-brand">{t("financialSummary")}</summary>
              <div className="mt-3 space-y-3">
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("sessionPrice")}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{f.money(appt.price)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("cost")}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{f.money(cost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("margin")}</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${margin.value < 0 ? "text-destructive-strong" : ""}`}>
                    {f.money(margin.value)}
                    {margin.percent !== null ? (
                      <Badge variant={margin.value < 0 ? "destructive" : "muted"} className="ml-2 align-middle">
                        {t("marginPercent", { percent: f.percent(margin.percent) })}
                      </Badge>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">{t("costHint")}</p>
              </div>
            </details>
            {/* Estorno: lançamento errado volta ao estoque com motivo; a sessão pode ser registrada de novo. */}
            <details className="mx-6 text-sm">
              <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
                <Undo2 className="h-4 w-4" aria-hidden /> {t("reverseTitle")}
              </summary>
              <ActionForm action={reverseProcedureAction} className="mt-2 space-y-2">
                <input type="hidden" name="appointmentId" value={appt.id} />
                <p className="text-xs text-muted-foreground">{t("reverseHint")}</p>
                <Label htmlFor="reverse-reason">{t("reverseReason")}</Label>
                <Input id="reverse-reason" name="reason" required maxLength={500} />
                <Button type="submit" variant="outline" size="sm">
                  {t("reverseSubmit")}
                </Button>
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      )}

      {returnAt && procedure.returnDays ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-brand" aria-hidden /> {t("returnTitle")}
              </CardTitle>
              <CardDescription>{t("returnDate", { date: f.dateLong(returnAt), days: procedure.returnDays })}</CardDescription>
            </div>
            <Button variant="outline" asChild>
              <Link
                href={`/app/agenda/novo?${new URLSearchParams({
                  patientId: appt.patientId,
                  procedureId: procedure.id,
                  startsAt: returnStartsAtLocal(appt.startsAt, procedure.returnDays),
                })}`}
              >
                {t("scheduleReturn")}
              </Link>
            </Button>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
