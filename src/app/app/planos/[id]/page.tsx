import Link from "next/link";
import { ArrowLeft, Check, Printer, Smile, X } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { DECIDUOUS_TEETH, isToothStatus, MAX_INSTALLMENTS, PERMANENT_TEETH, planTotals, splitInstallments, type ToothStatus } from "@/lib/odonto";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmSubmit } from "@/components/forms/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { canApprovePlans, canClinical, canClinicalWrite, canEditPlans, canPlans, findPlan, requireOdonto } from "@/app/app/odonto/_lib";
import { FacesField, ToothChart, ToothTag } from "@/app/app/odonto/_components/tooth-chart";
import { ITEM_BADGE, PLAN_BADGE } from "@/app/app/odonto/_components/badges";
import { addItemAction, approvePlanAction, cancelItemAction, completeItemAction, removeItemAction, setPlanStatusAction, updatePlanAction } from "../_actions";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: { id: string }; searchParams: { aprovado?: string; situacao?: string; feito?: string; naofeito?: string } }) {
  const ctx = await requireOdonto("odontograma", canPlans);
  const plan = await findPlan(ctx, params.id);
  const [t, tc, f, procedures, professionals, records] = await Promise.all([
    getTranslations("odonto.plans"),
    getTranslations("odonto.chart"),
    getFormat(),
    db.dentalProcedure.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: [{ specialty: "asc" }, { name: "asc" }] }),
    db.professional.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, select: { id: true, fullName: true, userId: true }, orderBy: { fullName: "asc" } }),
    canClinical(ctx) ? db.toothRecord.findMany({ where: { patientId: plan.patient.id, workspaceId: ctx.workspace.id } }) : Promise.resolve([]),
  ]);
  const ts = await getTranslations("odonto.table");
  const totals = planTotals(plan.items, plan.discount);
  const editable = plan.status === "em_estudo" && canEditPlans(ctx);
  const me = professionals.find((p) => p.userId === ctx.user.id)?.id ?? plan.professionalId ?? "";
  const teeth = Object.fromEntries(records.filter((r) => isToothStatus(r.status)).map((r) => [r.tooth, r.status as ToothStatus])) as Record<number, ToothStatus>;
  const planned = new Set(plan.items.filter((i) => i.status === "planejado" && i.tooth).map((i) => i.tooth!));
  // Mesma regra das parcelas geradas (diferença de centavos na primeira).
  const installmentText = (n: number, net: number) => {
    const parts = splitInstallments(net, n, dateKeySP());
    return parts.length > 1 && parts[0].amount !== parts[1].amount
      ? t("installmentsUneven", { count: parts.length, first: f.money(parts[0].amount), other: f.money(parts[1].amount) })
      : t("installmentsSummary", { count: parts.length, value: f.money(parts[0]?.amount ?? 0) });
  };
  const toothOptions = (list: number[]) => list.map((n) => <option key={n} value={n}>{n}</option>);

  return (
    <div className="space-y-6">
      <Link href={`/app/planos`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("title")}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title flex flex-wrap items-center gap-2">
            <span className="font-tooth">{t("number", { number: plan.number })}</span> · {plan.patient.fullName}
            <Badge variant={PLAN_BADGE[plan.status] ?? "muted"}>{t(`status.${plan.status}`)}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {plan.title ? `${plan.title} · ` : ""}
            {plan.professional?.fullName ?? t("anyProfessional")} · {t("createdOn", { date: f.date(plan.createdAt) })}
            {plan.validUntil && plan.status === "em_estudo" ? ` · ${t("validUntil", { date: f.date(plan.validUntil) })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canClinical(ctx) ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/app/pacientes/${plan.patient.id}/odontograma`}>
                <Smile className="h-4 w-4" aria-hidden /> {t("openChart")}
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/impressao/orcamento/${plan.id}`} target="_blank">
              <Printer className="h-4 w-4" aria-hidden /> {t("print")}
            </Link>
          </Button>
        </div>
      </header>

      {searchParams.aprovado && /^\d+$/.test(searchParams.aprovado) ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("approved", { count: Number(searchParams.aprovado) })}
        </p>
      ) : searchParams.feito && plan.items.some((i) => i.id === searchParams.feito) ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("itemDone", { name: plan.items.find((i) => i.id === searchParams.feito)!.name })}
        </p>
      ) : searchParams.naofeito ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("itemCancelled")}
        </p>
      ) : searchParams.situacao ? (
        <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
          {t("statusSaved")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("itemsTitle")}</CardTitle>
              <CardDescription>{t("progress", { done: totals.doneCount, total: totals.count })}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {plan.items.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noItems")}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("columns.tooth")}</TH>
                      <TH>{t("columns.procedure")}</TH>
                      <TH className="text-right">{t("columns.price")}</TH>
                      <TH>{t("columns.status")}</TH>
                      <TH>
                        <span className="sr-only">{t("columns.actions")}</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {plan.items.map((i) => (
                      <TR key={i.id} className={i.status === "cancelado" ? "opacity-60" : ""}>
                        <TD>
                          <ToothTag tooth={i.tooth} faces={i.faces} />
                        </TD>
                        <TD>
                          {i.name}
                          {i.tussCode ? <span className="font-tooth block text-xs text-muted-foreground">TUSS {i.tussCode}</span> : null}
                          {i.status === "realizado" && i.doneAt ? (
                            <span className="block text-xs text-muted-foreground">{t("doneBy", { date: f.date(i.doneAt), name: i.professional?.fullName ?? "-" })}</span>
                          ) : null}
                        </TD>
                        <TD className="text-right tabular-nums">{f.money(i.price)}</TD>
                        <TD>
                          <Badge variant={ITEM_BADGE[i.status] ?? "muted"}>{t(`itemStatus.${i.status}`)}</Badge>
                        </TD>
                        <TD>
                          <div className="flex flex-wrap justify-end gap-1">
                            {editable ? (
                              <ActionForm action={removeItemAction}>
                                <input type="hidden" name="planId" value={plan.id} />
                                <input type="hidden" name="itemId" value={i.id} />
                                <Button type="submit" size="sm" variant="ghost" aria-label={t("removeItem", { name: i.name })}>
                                  <X className="h-4 w-4" aria-hidden />
                                </Button>
                              </ActionForm>
                            ) : null}
                            {plan.status === "aprovado" && i.status === "planejado" && canClinicalWrite(ctx) ? (
                              <details className="w-full sm:w-72">
                                <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-sm hover:bg-accent">
                                  <Check className="h-4 w-4" aria-hidden /> {t("markDone")}
                                </summary>
                                {/* Vira evolução no prontuário: o que foi feito, no dente e nas faces, por quem. */}
                                <ActionForm action={completeItemAction} className="mt-2 space-y-2 rounded-lg border p-3">
                                  <input type="hidden" name="planId" value={plan.id} />
                                  <input type="hidden" name="itemId" value={i.id} />
                                  {ctx.role === "professional" ? null : (
                                    <Select name="professionalId" defaultValue={me} aria-label={t("doneProfessional")} className="h-8 text-xs">
                                      <option value="">{t("doneProfessional")}</option>
                                      {professionals.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.fullName}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                  <Label htmlFor={`evo-${i.id}`} className="text-xs">
                                    {t("evolutionLabel")}
                                  </Label>
                                  <Textarea id={`evo-${i.id}`} name="evolution" rows={2} maxLength={2000} placeholder={t("evolutionPlaceholder")} />
                                  <Button type="submit" size="sm">
                                    {t("confirmDone")}
                                  </Button>
                                </ActionForm>
                              </details>
                            ) : null}
                            {plan.status === "aprovado" && i.status === "planejado" && (canClinicalWrite(ctx) || canApprovePlans(ctx)) ? (
                              <ActionForm action={cancelItemAction}>
                                <input type="hidden" name="planId" value={plan.id} />
                                <input type="hidden" name="itemId" value={i.id} />
                                <ConfirmSubmit size="sm" variant="ghost" confirmText={t("cancelItemConfirm", { name: i.name })}>
                                  {t("cancelItem")}
                                </ConfirmSubmit>
                              </ActionForm>
                            ) : null}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {editable ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("addTitle")}</CardTitle>
                <CardDescription>
                  {procedures.length ? (
                    t("addDescription")
                  ) : (
                    <>
                      {t("addNoTable")}{" "}
                      <Link href="/app/planos/tabela" className="text-brand underline-offset-4 hover:underline">
                        {t("tableLink")}
                      </Link>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={addItemAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="planId" value={plan.id} />
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="procedureId">{t("procedure")}</Label>
                    <Select id="procedureId" name="procedureId" defaultValue={procedures[0]?.id ?? ""}>
                      {procedures.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.price !== null ? ` · ${f.money(p.price)}` : ""}
                          {p.perTooth ? ` · ${t("perTooth")}` : ""}
                        </option>
                      ))}
                      <option value="">{t("customProcedure")}</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("customName")}</Label>
                    <Input id="name" name="name" maxLength={160} placeholder={t("customNamePlaceholder")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tooth">{t("tooth")}</Label>
                    <Select id="tooth" name="tooth" defaultValue="" className="font-tooth">
                      <option value="">{t("noTooth")}</option>
                      <optgroup label={tc("dentition.permanente")}>{toothOptions([...PERMANENT_TEETH].sort((a, b) => a - b))}</optgroup>
                      <optgroup label={tc("dentition.decidua")}>{toothOptions([...DECIDUOUS_TEETH].sort((a, b) => a - b))}</optgroup>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <FacesField idPrefix="add-face" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="price">{t("price")}</Label>
                    <Input id="price" name="price" inputMode="decimal" placeholder={t("pricePlaceholder")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tussCode">{ts("tuss")}</Label>
                    <Input id="tussCode" name="tussCode" inputMode="numeric" maxLength={8} className="font-tooth" placeholder="81000065" />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit">{t("addItem")}</Button>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          {canClinical(ctx) ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("chartTitle")}</CardTitle>
                <CardDescription>{planned.size ? t("chartPlanned", { teeth: [...planned].sort((a, b) => a - b).join(", ") }) : t("chartDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ToothChart teeth={teeth} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("totalsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="flex justify-between">
                <span>{t("gross")}</span>
                <span className="tabular-nums">{f.money(totals.gross)}</span>
              </p>
              <p className="flex justify-between text-muted-foreground">
                <span>{t("discount")}</span>
                <span className="tabular-nums">- {f.money(totals.discount)}</span>
              </p>
              <p className="flex justify-between border-t pt-2 text-lg font-semibold">
                <span>{t("net")}</span>
                <span className="tabular-nums">{f.money(totals.net)}</span>
              </p>
              <p className="text-muted-foreground">{installmentText(plan.installments, totals.net)}</p>
            </CardContent>
          </Card>

          {editable ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("conditionsTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updatePlanAction} className="space-y-3">
                  <input type="hidden" name="planId" value={plan.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="title">{t("planTitle")}</Label>
                    <Input id="title" name="title" maxLength={120} defaultValue={plan.title ?? ""} placeholder={t("planTitlePlaceholder")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="professionalId">{t("professional")}</Label>
                    <Select id="professionalId" name="professionalId" defaultValue={plan.professionalId ?? ""}>
                      <option value="">{t("anyProfessional")}</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="discount">{t("discount")}</Label>
                      <Input id="discount" name="discount" inputMode="decimal" defaultValue={plan.discount ? String(plan.discount).replace(".", ",") : ""} placeholder="0,00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="installments">{t("installments")}</Label>
                      <Input id="installments" name="installments" type="number" min={1} max={MAX_INSTALLMENTS} defaultValue={plan.installments} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="firstDueDate">{t("firstDue")}</Label>
                      <Input id="firstDueDate" name="firstDueDate" type="date" defaultValue={plan.firstDueDate ? dateKeySP(plan.firstDueDate) : ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="validUntil">{t("validLabel")}</Label>
                      <Input id="validUntil" name="validUntil" type="date" defaultValue={plan.validUntil ? dateKeySP(plan.validUntil) : ""} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notes">{t("notes")}</Label>
                    <Textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={plan.notes ?? ""} placeholder={t("notesPlaceholder")} />
                  </div>
                  <Button type="submit" variant="outline">
                    {t("saveConditions")}
                  </Button>
                </ActionForm>
              </CardContent>
            </Card>
          ) : plan.notes ? (
            <Card>
              <CardContent className="p-5 text-sm">{plan.notes}</CardContent>
            </Card>
          ) : null}

          {plan.status === "em_estudo" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("decisionTitle")}</CardTitle>
                <CardDescription>{t("decisionDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {canApprovePlans(ctx) ? (
                  <ActionForm action={approvePlanAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="planId" value={plan.id} />
                    <div className="space-y-1.5">
                      <Label htmlFor="method">{t("method")}</Label>
                      <Select id="method" name="method" defaultValue="pix" className="w-36">
                        {["pix", "boleto", "card", "dinheiro"].map((m) => (
                          <option key={m} value={m}>
                            {t(`methods.${m}`)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button type="submit" variant="success">
                      {t("approve")}
                    </Button>
                  </ActionForm>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("approveOnlyFinance")}</p>
                )}
                {canEditPlans(ctx) ? (
                  <ActionForm action={setPlanStatusAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="status" value="recusado" />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("refuse")}
                    </Button>
                  </ActionForm>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {plan.status === "recusado" && canEditPlans(ctx) ? (
            <ActionForm action={setPlanStatusAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="status" value="em_estudo" />
              <Button type="submit" variant="outline">
                {t("reopen")}
              </Button>
            </ActionForm>
          ) : null}

          {plan.charges.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("chargesTitle")}</CardTitle>
                <CardDescription>{t("chargesDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {plan.charges.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-6 py-2.5 text-sm">
                      <Link href={`/app/financeiro/${c.id}`} className="text-brand underline-offset-4 hover:underline">
                        {t("installmentOf", { n: c.installment ?? 1, total: plan.charges.length })} · {f.date(c.dueDate)}
                      </Link>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{f.money(c.amount)}</span>
                        <Badge variant={c.status === "paid" ? "success" : c.status === "cancelled" ? "muted" : c.status === "overdue" ? "destructive" : "warning"}>
                          {t(`chargeStatus.${c.status}`)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {plan.status === "aprovado" && canApprovePlans(ctx) ? (
            <ActionForm action={setPlanStatusAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="status" value="cancelado" />
              <ConfirmSubmit variant="ghost" size="sm" className="text-destructive-strong" confirmText={t("cancelPlanConfirm")}>
                {t("cancelPlan")}
              </ConfirmSubmit>
            </ActionForm>
          ) : null}
        </div>
      </div>
    </div>
  );
}
