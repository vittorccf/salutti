import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { moduleEnabled } from "@/lib/areas";
import { ufSigla } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { getFormat, getTranslations } from "@/i18n/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrintButton } from "@/components/print-button";
import { patientScope } from "@/app/app/odonto/_lib";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ordem de serviço", robots: { index: false } };

// Ordem de serviço para o laboratório de prótese: o técnico só executa com OS do cirurgião-dentista (Lei 6.710/79).
// Duas vias: uma vai com o trabalho, outra fica no prontuário para conferir no retorno.
export default async function PrintLabOrderPage({ params }: { params: { id: string } }) {
  const ctx = await requireContext();
  if (ctx.support || !moduleEnabled(ctx.workspace, "protese") || !can(ctx, "pacientes.gerenciar")) notFound();
  const order = await db.labOrder.findFirst({
    where: { id: params.id, workspaceId: ctx.workspace.id, patient: { deletedAt: null, ...patientScope(ctx) } },
    include: {
      patient: { select: { fullName: true, birthDate: true } },
      professional: { select: { fullName: true, councilType: true, councilNumber: true, councilUF: true } },
    },
  });
  if (!order) notFound();
  const [t, f] = await Promise.all([getTranslations("odonto.labPrint"), getFormat()]);
  const pro = order.professional;
  const cro = pro?.councilNumber ? `${pro.councilType}${pro.councilUF ? `-${ufSigla(pro.councilUF)}` : ""} ${pro.councilNumber}` : null;
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b py-2">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <main data-area="odonto" className="mx-auto max-w-2xl space-y-6 bg-background p-8 text-sm text-foreground print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      {!pro ? (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-warning-strong print:hidden">
          {t("needsDentist")}
        </p>
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <BrandLogo area="odonto" height={28} />
          <p className="font-semibold">{ctx.workspace.name}</p>
        </div>
        <div className="text-right">
          <p className="text-page-title">{t("title")}</p>
          <p className="text-muted-foreground">{t("issued", { date: f.date(order.createdAt) })}</p>
        </div>
      </header>
      <section>
        {row(t("lab"), order.lab)}
        {row(t("patient"), `${order.patient.fullName}${order.patient.birthDate ? ` · ${f.date(order.patient.birthDate)}` : ""}`)}
        {row(t("work"), order.work)}
        {row(t("teeth"), <span className="font-tooth">{order.teeth ?? "-"}</span>)}
        {row(t("shade"), order.shade ?? "-")}
        {row(t("sent"), order.sentAt ? f.date(order.sentAt) : "-")}
        {row(t("due"), order.dueAt ? f.date(order.dueAt) : "-")}
        {row(t("notes"), <span className="whitespace-pre-line">{order.notes ?? "-"}</span>)}
      </section>
      <section className="grid gap-8 pt-10 sm:grid-cols-2">
        <div className="border-t pt-2 text-center">
          <p>{pro?.fullName ?? ""}</p>
          <p className="text-xs text-muted-foreground">{cro ?? t("dentistSignature")}</p>
        </div>
        <div className="border-t pt-2 text-center">
          <p>{order.lab}</p>
          <p className="text-xs text-muted-foreground">{t("labSignature")}</p>
        </div>
      </section>
    </main>
  );
}
