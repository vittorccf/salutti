import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { areaOf } from "@/lib/areas";
import { recordAudit } from "@/lib/audit";
import { formatCnpj } from "@/lib/cnpj";
import { formatCpf } from "@/lib/cpf";
import { ufSigla } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { payerOf } from "@/app/app/fiscal/_data";
import { moneyInWords } from "@/lib/tax";
import { getFormat, getTranslations } from "@/i18n/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo", robots: { index: false } };

// Recibo de serviço de saúde com o que a Receita pede para dedução (Lei 9.250/95, art. 8º, § 2º, III): nome, endereço e
// CPF/CNPJ de quem recebeu; paciente e pagador com CPF; valor em número e por extenso; data, descrição e assinatura.
export default async function PrintReceiptPage({ params }: { params: { id: string } }) {
  const ctx = await requireContext();
  if (ctx.support || !can(ctx, "fiscal.ver")) notFound();
  const receipt = await db.receipt.findFirst({
    where: { id: params.id, workspaceId: ctx.workspace.id },
    include: {
      patient: { select: { fullName: true, cpf: true, responsibleName: true, responsibleCpf: true } },
      charge: { select: { paidAt: true, appointment: { select: { startsAt: true, professional: { select: { fullName: true, councilType: true, councilNumber: true, councilUF: true } } } } } },
    },
  });
  if (!receipt) notFound();
  const [t, f] = await Promise.all([getTranslations("fiscal.receiptPrint"), getFormat()]);
  const ws = ctx.workspace;
  const pro =
    receipt.charge?.appointment?.professional ??
    (await db.professional.findFirst({ where: { workspaceId: ws.id, active: true }, orderBy: { createdAt: "asc" }, select: { fullName: true, councilType: true, councilNumber: true, councilUF: true } }));
  const cro = pro?.councilNumber ? `${pro.councilType}${pro.councilUF ? `-${ufSigla(pro.councilUF)}` : ""} ${pro.councilNumber}` : null;
  const address = [ws.street, ws.addressNumber, ws.district, ws.city && ws.state ? `${ws.city}/${ws.state}` : ws.city].filter(Boolean).join(", ");
  const doc = ws.cnpj ? `CNPJ ${formatCnpj(ws.cnpj)}` : ws.taxCpf ? `CPF ${formatCpf(ws.taxCpf)}` : null;
  // Com CNPJ quem recebe é o consultório (o profissional aparece como responsável técnico); sem CNPJ, o profissional.
  const issuer = ws.cnpj ? ws.name : (pro?.fullName ?? ws.name);
  const payer = payerOf(receipt.patient);
  const hasResponsible = !!receipt.patient.responsibleName || payer.payerCpf !== receipt.patient.cpf;
  await recordAudit({ workspaceId: ws.id, userId: ctx.user.id, action: "fiscal.receipt.print", entity: "Receipt", entityId: receipt.id });
  const paidAt = receipt.charge?.paidAt ?? receipt.issuedAt;
  const service = t(`service.${areaOf(ws.area)}`);

  return (
    <main data-area={areaOf(ws.area) === "mental" ? undefined : areaOf(ws.area)} className="mx-auto max-w-2xl space-y-6 bg-background p-8 text-sm text-foreground print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      {!doc ? (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-warning-strong print:hidden">
          {t("needsDoc")}
        </p>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <BrandLogo area={areaOf(ws.area)} height={28} />
          <p className="font-semibold">{issuer}</p>
          {ws.cnpj && pro ? <p className="text-muted-foreground">{pro.fullName}</p> : null}
          {cro ? <p className="text-muted-foreground">{cro}</p> : null}
          {doc ? <p className="text-muted-foreground">{doc}</p> : null}
          {address ? <p className="text-muted-foreground">{address}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-page-title">{t("title")}</p>
          <p className="font-mono">{receipt.receiptNumber}</p>
          <p className="text-2xl font-semibold tabular-nums">{f.money(receipt.amount)}</p>
        </div>
      </header>
      <p className="leading-relaxed">
        {t("body", {
          name: payer.payerName,
          amount: f.money(receipt.amount),
          words: moneyInWords(receipt.amount),
          service,
          patient: receipt.patient.fullName,
          date: f.date(receipt.charge?.appointment?.startsAt ?? paidAt),
        })}
      </p>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("patient")}</dt>
          <dd>
            {receipt.patient.fullName}
            {receipt.patient.cpf ? ` · CPF ${formatCpf(receipt.patient.cpf)}` : ""}
          </dd>
        </div>
        {hasResponsible ? (
          <div>
            <dt className="text-muted-foreground">{t("payer")}</dt>
            <dd>
              {receipt.patient.responsibleName ?? payer.payerName}
              {receipt.patient.responsibleCpf ? ` · CPF ${formatCpf(receipt.patient.responsibleCpf)}` : ""}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">{t("paidOn")}</dt>
          <dd>{f.date(paidAt)}</dd>
        </div>
      </dl>
      <section className="pt-10">
        <p className="text-muted-foreground">{ws.city ? t("placeDate", { city: ws.city, date: f.dateLong(paidAt) }) : t("dateOnly", { date: f.dateLong(paidAt) })}</p>
        <div className="mt-12 max-w-xs border-t pt-2">
          <p>{pro?.fullName ?? ws.name}</p>
          <p className="text-xs text-muted-foreground">{cro ?? t("signature")}</p>
        </div>
      </section>
    </main>
  );
}
