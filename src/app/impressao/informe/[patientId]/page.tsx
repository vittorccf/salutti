import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { areaOf } from "@/lib/areas";
import { dateKeySP } from "@/lib/dates";
import { recordAudit } from "@/lib/audit";
import { formatCnpj } from "@/lib/cnpj";
import { formatCpf } from "@/lib/cpf";
import { ufSigla } from "@/lib/labels";
import { can, canManagePayables } from "@/lib/permissions";
import { getFormat, getTranslations } from "@/i18n/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrintButton } from "@/components/print-button";
import { patientYear } from "@/app/app/fiscal/_data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Informe de pagamentos", robots: { index: false } };

// Informe anual de pagamentos para a declaração do paciente (despesas médicas): prestador, paciente, ano, valores por
// mês e total. Só o que foi efetivamente pago no ano.
export default async function PrintYearReportPage({ params, searchParams }: { params: { patientId: string }; searchParams: { ano?: string } }) {
  const ctx = await requireContext();
  if (ctx.support || !can(ctx, "fiscal.ver") || !canManagePayables(ctx)) notFound();
  const lastYear = Number(dateKeySP().slice(0, 4)) - 1;
  const year = /^\d{4}$/.test(searchParams.ano ?? "") ? Number(searchParams.ano) : lastYear;
  const patient = await db.patient.findFirst({ where: { id: params.patientId, workspaceId: ctx.workspace.id, deletedAt: null }, select: { id: true, fullName: true, cpf: true, responsibleName: true, responsibleCpf: true } });
  if (!patient) notFound();
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "fiscal.yearReport.print", entity: "Patient", entityId: patient.id, metadata: { year } });
  const [t, f, charges, pro] = await Promise.all([
    getTranslations("fiscal.yearReport"),
    getFormat(),
    patientYear(ctx.workspace.id, patient.id, year),
    db.professional.findFirst({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { createdAt: "asc" }, select: { fullName: true, councilType: true, councilNumber: true, councilUF: true } }),
  ]);
  const ws = ctx.workspace;
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { key, total: charges.filter((c) => dateKeySP(c.paidAt!).startsWith(key)).reduce((s, c) => s + Math.round(c.amount * 100), 0) / 100 };
  });
  const total = byMonth.reduce((s, m) => s + Math.round(m.total * 100), 0) / 100;
  const doc = ws.cnpj ? `CNPJ ${formatCnpj(ws.cnpj)}` : ws.taxCpf ? `CPF ${formatCpf(ws.taxCpf)}` : null;
  const cro = pro?.councilNumber ? `${pro.councilType}${pro.councilUF ? `-${ufSigla(pro.councilUF)}` : ""} ${pro.councilNumber}` : null;
  const address = [ws.street, ws.addressNumber, ws.district, ws.city && ws.state ? `${ws.city}/${ws.state}` : ws.city].filter(Boolean).join(", ");

  return (
    <main className="mx-auto max-w-2xl space-y-6 bg-background p-8 text-sm text-foreground print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <BrandLogo area={areaOf(ws.area)} height={28} />
          <p className="font-semibold">{ws.cnpj ? ws.name : pro?.fullName ?? ws.name}</p>
          {cro ? <p className="text-muted-foreground">{cro}</p> : null}
          {doc ? <p className="text-muted-foreground">{doc}</p> : null}
          {address ? <p className="text-muted-foreground">{address}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-page-title">{t("title")}</p>
          <p className="text-muted-foreground">{t("year", { year })}</p>
        </div>
      </header>
      <p>
        {t("patient")}: <span className="font-medium">{patient.fullName}</span>
        {patient.cpf ? ` · CPF ${formatCpf(patient.cpf)}` : ""}
        {patient.responsibleName ? (
          <span className="block text-muted-foreground">
            {t("responsible", { name: patient.responsibleName })}
            {patient.responsibleCpf ? ` · CPF ${formatCpf(patient.responsibleCpf)}` : ""}
          </span>
        ) : null}
      </p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 font-medium">{t("month")}</th>
            <th className="py-2 text-right font-medium">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {byMonth.map((m) => (
            <tr key={m.key} className="border-b">
              <td className="py-1.5 capitalize">{f.monthYear(`${m.key}-15T12:00:00Z`)}</td>
              <td className="py-1.5 text-right tabular-nums">{m.total ? f.money(m.total) : "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-2 font-semibold">{t("total")}</td>
            <td className="pt-2 text-right text-base font-semibold tabular-nums">{f.money(total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-muted-foreground">{areaOf(ws.area) === "estetica" ? t("noteEstetica") : t("note")}</p>
      <div className="mt-12 max-w-xs border-t pt-2">
        <p>{ws.cnpj ? ws.name : pro?.fullName ?? ws.name}</p>
        <p className="text-xs text-muted-foreground">{t("signature")}</p>
      </div>
    </main>
  );
}
