import type { Metadata } from "next";
import { requireContext } from "@/lib/auth";
import { notFound } from "next/navigation";
import { dateKeySP } from "@/lib/dates";
import { ufSigla } from "@/lib/labels";
import { moduleEnabled } from "@/lib/areas";
import { formatCpf } from "@/lib/cpf";
import { planTotals, splitInstallments } from "@/lib/odonto";
import { getFormat, getTranslations } from "@/i18n/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrintButton } from "@/components/print-button";
import { canPlans, findPlan } from "@/app/app/odonto/_lib";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orçamento", robots: { index: false } };

// Orçamento/plano de tratamento para entregar ao paciente (papel ou PDF pelo navegador): consultório, paciente,
// procedimentos por dente (FDI) e face, condições de pagamento, validade e espaço para a assinatura de aceite.
export default async function PrintPlanPage({ params }: { params: { id: string } }) {
  // Guarda completa (teste vencido, sessão) e nunca na sessão de suporte: o orçamento traz CPF e dado de saúde.
  const ctx = await requireContext();
  if (ctx.support || !moduleEnabled(ctx.workspace, "odontograma") || !canPlans(ctx)) notFound();
  const plan = await findPlan(ctx, params.id);
  const [t, f] = await Promise.all([getTranslations("odonto.print"), getFormat()]);
  const tp = await getTranslations("odonto.plans");
  const totals = planTotals(plan.items, plan.discount);
  const ws = ctx.workspace;
  const address = [ws.street, ws.addressNumber, ws.district, ws.city && ws.state ? `${ws.city}/${ws.state}` : ws.city].filter(Boolean).join(", ");
  const pro = plan.professional;
  const items = plan.items.filter((i) => i.status !== "cancelado");
  const parts = splitInstallments(totals.net, plan.installments, plan.firstDueDate ? dateKeySP(plan.firstDueDate) : dateKeySP());
  const cro = pro?.councilNumber ? `${pro.councilType}${pro.councilUF ? `-${ufSigla(pro.councilUF)}` : ""} ${pro.councilNumber}` : null;

  // Sem dentista responsável não há orçamento para entregar (assinatura e CRO).
  if (!pro) {
    return (
      <main data-area="odonto" className="mx-auto max-w-xl p-8 text-sm">
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-warning-strong">
          {t("needsDentist")}
        </p>
      </main>
    );
  }

  return (
    <main data-area="odonto" className="mx-auto max-w-3xl space-y-6 bg-background p-8 text-sm text-foreground print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <BrandLogo area="odonto" height={28} />
          <p className="font-semibold">{ws.name}</p>
          {address ? <p className="text-muted-foreground">{address}</p> : null}
          {ws.cnpj ? <p className="text-muted-foreground">CNPJ {ws.cnpj}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-page-title">{t("title")}</p>
          <p className="font-tooth">{tp("number", { number: plan.number })}</p>
          <p className="text-muted-foreground">{t("issued", { date: f.date(plan.createdAt) })}</p>
          {plan.validUntil ? <p className="text-muted-foreground">{t("valid", { date: f.date(plan.validUntil) })}</p> : null}
        </div>
      </header>

      <section className="grid gap-1 sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">{t("patient")}: </span>
          {plan.patient.fullName}
          {plan.patient.cpf ? ` · CPF ${formatCpf(plan.patient.cpf)}` : ""}
          {plan.patient.responsibleName ? <span className="block text-muted-foreground">{t("responsible", { name: plan.patient.responsibleName })}</span> : null}
        </p>
        {pro ? (
          <p className="sm:text-right">
            <span className="text-muted-foreground">{t("dentist")}: </span>
            {pro.fullName}
            {cro ? ` · ${cro}` : ""}
          </p>
        ) : null}
      </section>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium">{t("tooth")}</th>
            <th className="py-2 pr-3 font-medium">{t("procedure")}</th>
            <th className="py-2 text-right font-medium">{t("price")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b">
              <td className="font-tooth py-2 pr-3 align-top">{i.tooth ? `${i.tooth}${i.faces ? ` · ${i.faces}` : ""}` : "-"}</td>
              <td className="py-2 pr-3 align-top">
                {i.name}
              </td>
              <td className="py-2 text-right align-top tabular-nums">{f.money(i.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-3 text-right text-muted-foreground">{t("gross")}</td>
            <td className="pt-3 text-right tabular-nums">{f.money(totals.gross)}</td>
          </tr>
          {totals.discount ? (
            <tr>
              <td colSpan={2} className="text-right text-muted-foreground">{t("discount")}</td>
              <td className="text-right tabular-nums">- {f.money(totals.discount)}</td>
            </tr>
          ) : null}
          <tr>
            <td colSpan={2} className="pt-1 text-right font-semibold">{t("total")}</td>
            <td className="pt-1 text-right text-base font-semibold tabular-nums">{f.money(totals.net)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="space-y-1">
        <p>
          {parts.length > 1 && parts[0].amount !== parts[1].amount
            ? t("paymentUneven", { count: parts.length, first: f.money(parts[0].amount), other: f.money(parts[1].amount) })
            : t("payment", { count: Math.max(1, parts.length), value: f.money(parts[0]?.amount ?? 0) })}
        </p>
        {plan.firstDueDate ? <p>{t("firstDue", { date: f.date(plan.firstDueDate) })}</p> : null}
        {plan.notes ? <p className="whitespace-pre-line">{plan.notes}</p> : null}
        <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
      </section>

      <section className="grid gap-8 pt-10 sm:grid-cols-2">
        <div className="border-t pt-2 text-center">
          <p>{plan.patient.fullName}</p>
          <p className="text-xs text-muted-foreground">{t("patientSignature")}</p>
        </div>
        <div className="border-t pt-2 text-center">
          <p>{pro.fullName}</p>
          <p className="text-xs text-muted-foreground">{cro ?? t("dentistSignature")}</p>
        </div>
      </section>
    </main>
  );
}
