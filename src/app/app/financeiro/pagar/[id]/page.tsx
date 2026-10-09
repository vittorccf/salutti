import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CopyPlus, Paperclip, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { formatLinhaDigitavel } from "@/lib/boleto";
import { mediaUrl } from "@/lib/media";
import { ATTACHMENT_KINDS, centsToInput, paymentOutflow, PAYMENT_METHODS, remainingCents } from "@/lib/payables";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PayableStatusBadge } from "../_components/payable-status";
import {
  addAttachmentAction,
  cancelPayableAction,
  extendSeriesAction,
  registerPaymentAction,
  removeAttachmentAction,
  reopenPayableAction,
  reversePaymentAction,
} from "../_actions";
import { payableInclude, requirePayables, statusOf } from "../_lib";

export const dynamic = "force-dynamic";

export default async function PayablePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayables();
  const { id } = await params;
  const p = await db.payable.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { ...payableInclude, attachments: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { paidAt: "asc" } } },
  });
  if (!p) notFound();
  const [t, ts, tm, tf, ta, tg, f] = await Promise.all([
    getTranslations("payables.detail"),
    getTranslations("payables.status"),
    getTranslations("payables.methods"),
    getTranslations("payables.frequencies"),
    getTranslations("payables.attachmentKinds"),
    getTranslations("payables.groups"),
    getFormat(),
  ]);
  const today = dateKeySP();
  const status = statusOf(p, today);
  const remaining = remainingCents({ ...p, dueDate: dateKeySP(p.dueDate) });
  const open = status !== "paid" && status !== "cancelled";
  const series = p.seriesId
    ? await db.payable.findMany({
        where: { workspaceId: ctx.workspace.id, seriesId: p.seriesId },
        include: { payments: true, supplier: { select: { id: true, name: true } }, category: { select: { id: true, name: true, group: true } }, _count: { select: { attachments: true } } },
        orderBy: { seriesIndex: "asc" },
      })
    : [];
  const isOpenRecurring = !!p.frequency && !p.installmentTotal;
  const outflow = p.payments.filter((x) => !x.reversedAt).reduce((s, x) => s + paymentOutflow(x), 0);
  const createdBy = p.createdById ? await db.user.findUnique({ where: { id: p.createdById }, select: { name: true } }) : null;

  const info: [string, string][] = [
    [t("supplier"), p.supplier?.name ?? "-"],
    [t("category"), `${p.category.name} (${tg(p.category.group)})`],
    [t("dueDate"), f.date(p.dueDate)],
    [t("competence"), f.monthYear(p.competenceDate)],
    [t("method"), p.method ? tm(p.method) : "-"],
    [t("documentNumber"), p.documentNumber ?? "-"],
    [t("costCenter"), p.costCenter ?? "-"],
    [t("deductible"), p.deductible ? t("yes") : t("no")],
    ...(p.installmentTotal ? ([[t("installment"), `${p.seriesIndex}/${p.installmentTotal}`]] as [string, string][]) : []),
    ...(isOpenRecurring && p.frequency ? ([[t("recurrence"), tf(p.frequency)]] as [string, string][]) : []),
    [t("createdBy"), `${createdBy?.name ?? "-"} · ${f.date(p.createdAt)}`],
  ];

  return (
    <div className="space-y-6">
      <Link href="/app/financeiro/pagar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-page-title">
            {p.description} · {f.money(p.amountCents / 100)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <PayableStatusBadge status={status} label={ts(status)} />
            {open ? <span>{t("remaining", { amount: f.money(remaining / 100) })}</span> : null}
            {p.cancelledAt ? <span>{t("cancelledOn", { date: f.date(p.cancelledAt), reason: p.cancelReason ?? "-" })}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!p.cancelledAt ? (
            <Button variant="outline" asChild>
              <Link href={`/app/financeiro/pagar/${p.id}/editar`}>
                <Pencil className="h-4 w-4" aria-hidden /> {t("edit")}
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={`/app/financeiro/pagar/nova?de=${p.id}`}>
              <CopyPlus className="h-4 w-4" aria-hidden /> {t("duplicate")}
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {info.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="text-sm">{v}</dd>
                  </div>
                ))}
              </dl>
              {p.barcode ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("barcode")}</p>
                  <p className="break-all font-mono text-sm">{formatLinhaDigitavel(p.barcode)}</p>
                  <CopyButton text={p.barcode} label={t("copyBarcode")} copiedLabel={t("copied")} />
                </div>
              ) : null}
              {p.pixCopyPaste ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t("pix")}</p>
                  <p className="break-all font-mono text-xs">{p.pixCopyPaste}</p>
                  <CopyButton text={p.pixCopyPaste} label={t("copyPix")} copiedLabel={t("copied")} />
                </div>
              ) : null}
              {p.notes ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t("notes")}</p>
                  <p className="whitespace-pre-line text-sm">{p.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("payments")}</CardTitle>
              <CardDescription>{t("paymentsDescription", { amount: f.money(outflow / 100) })}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {p.payments.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noPayments")}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("paidAt")}</TH>
                      <TH className="text-right">{t("principal")}</TH>
                      <TH className="text-right">{t("charges")}</TH>
                      <TH className="text-right">{t("discount")}</TH>
                      <TH className="text-right">{t("total")}</TH>
                      <TH>{t("method")}</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {p.payments.map((x) => (
                      <TR key={x.id} className={x.reversedAt ? "text-muted-foreground line-through" : ""}>
                        <TD className="tabular-nums">{f.date(x.paidAt)}</TD>
                        <TD className="text-right tabular-nums">{f.money(x.principalCents / 100)}</TD>
                        <TD className="text-right tabular-nums">{f.money((x.interestCents + x.fineCents) / 100)}</TD>
                        <TD className="text-right tabular-nums">{f.money(x.discountCents / 100)}</TD>
                        <TD className="text-right tabular-nums">{f.money(paymentOutflow(x) / 100)}</TD>
                        <TD>{x.method ? tm(x.method) : "-"}</TD>
                        <TD className="text-right">
                          {x.reversedAt ? (
                            <span className="text-xs no-underline">{t("reversedOn", { date: f.date(x.reversedAt) })}</span>
                          ) : (
                            <ActionForm action={reversePaymentAction}>
                              <input type="hidden" name="paymentId" value={x.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                {t("reverse")}
                              </Button>
                            </ActionForm>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {series.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>{p.installmentTotal ? t("installmentsTitle") : t("seriesTitle")}</CardTitle>
                <CardDescription>{t("seriesDescription", { count: series.length })}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>#</TH>
                      <TH>{t("dueDate")}</TH>
                      <TH className="text-right">{t("amount")}</TH>
                      <TH>{t("statusCol")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {series.map((s) => {
                      const st = statusOf(s, today);
                      return (
                        <TR key={s.id} className={s.id === p.id ? "bg-accent/50" : ""}>
                          <TD className="tabular-nums">{s.seriesIndex}</TD>
                          <TD className="tabular-nums">
                            <Link href={`/app/financeiro/pagar/${s.id}`} className="text-brand underline-offset-4 hover:underline" aria-current={s.id === p.id ? "page" : undefined}>
                              {f.date(s.dueDate)}
                            </Link>
                          </TD>
                          <TD className="text-right tabular-nums">{f.money(s.amountCents / 100)}</TD>
                          <TD>
                            <PayableStatusBadge status={st} label={ts(st)} />
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                {isOpenRecurring ? (
                  <ActionForm action={extendSeriesAction} className="space-y-2 p-4">
                    <input type="hidden" name="seriesId" value={p.seriesId ?? ""} />
                    <Button type="submit" variant="outline" size="sm">
                      {t("extendSeries")}
                    </Button>
                  </ActionForm>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {open ? (
            <Card id="pagar">
              <CardHeader>
                <CardTitle>{t("payTitle")}</CardTitle>
                <CardDescription>{t("payDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={registerPaymentAction} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="paidAt">{t("paidAt")}</Label>
                      <Input id="paidAt" name="paidAt" type="date" max={today} defaultValue={today} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="paidAmount">{t("paidAmount")}</Label>
                      <Input id="paidAmount" name="paidAmount" inputMode="decimal" defaultValue={centsToInput(remaining)} required className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="interest">{t("interest")}</Label>
                      <Input id="interest" name="interest" inputMode="decimal" placeholder="0,00" className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fine">{t("fine")}</Label>
                      <Input id="fine" name="fine" inputMode="decimal" placeholder="0,00" className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="discount">{t("discount")}</Label>
                      <Input id="discount" name="discount" inputMode="decimal" placeholder="0,00" className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pay-method">{t("method")}</Label>
                      <Select id="pay-method" name="method" defaultValue={p.method ?? ""}>
                        <option value="">-</option>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {tm(m)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("paidAmountHint")}</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="receipt">{t("receipt")}</Label>
                    <Input id="receipt" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pay-notes">{t("notes")}</Label>
                    <Input id="pay-notes" name="notes" maxLength={300} />
                  </div>
                  <Button type="submit" className="w-full">
                    {t("register")}
                  </Button>
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" aria-hidden /> {t("attachments")}
              </CardTitle>
              <CardDescription>{t("attachmentsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {p.attachments.length ? (
                <ul className="space-y-2">
                  {p.attachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <a href={mediaUrl(a.mediaId) ?? "#"} target="_blank" rel="noopener" className="min-w-0 truncate text-brand underline-offset-4 hover:underline">
                        <span className="text-muted-foreground">{ta(a.kind)}:</span> {a.fileName}
                      </a>
                      <ActionForm action={removeAttachmentAction}>
                        <input type="hidden" name="attachmentId" value={a.id} />
                        <Button type="submit" variant="ghost" size="sm" aria-label={t("removeAttachment", { name: a.fileName })}>
                          {t("remove")}
                        </Button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noAttachments")}</p>
              )}
              <ActionForm action={addAttachmentAction} resetOnSuccess className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="att-file">{t("file")}</Label>
                  <Input id="att-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="att-kind">{t("kind")}</Label>
                    <Select id="att-kind" name="kind" defaultValue="comprovante">
                      {ATTACHMENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ta(k)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" variant="outline">
                    {t("attach")}
                  </Button>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{p.cancelledAt ? t("reopenTitle") : t("cancelTitle")}</CardTitle>
              <CardDescription>{p.cancelledAt ? t("reopenDescription") : t("cancelDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {p.cancelledAt ? (
                <ActionForm action={reopenPayableAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" variant="outline">
                    {t("reopen")}
                  </Button>
                </ActionForm>
              ) : (
                <ActionForm action={cancelPayableAction} className="space-y-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">{t("cancelReason")}</Label>
                    <Input id="reason" name="reason" maxLength={200} />
                  </div>
                  {p.seriesId ? (
                    <div className="space-y-1 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="scope" value="one" defaultChecked className="h-4 w-4 accent-primary" />
                        {t("scopeOne")}
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="scope" value="following" className="h-4 w-4 accent-primary" />
                        {t("scopeFollowing")}
                      </label>
                    </div>
                  ) : null}
                  <Button type="submit" variant="outline" className="text-destructive-strong">
                    {t("cancel")}
                  </Button>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
