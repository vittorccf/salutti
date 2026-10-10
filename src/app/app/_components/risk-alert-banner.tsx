import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { requireContext } from "@/lib/auth";
import { pendingRiskAlerts } from "@/lib/diary-alerts";
import { getTranslations } from "@/i18n/server";

// Faixa de alerta do cartão diário (PHQ-9 item 9 sem conduta registrada): no topo de todas as telas do app e na ficha
// do paciente. Some quando a conduta é registrada no cartão do paciente.
export async function RiskAlertBanner({ ctx, patientId }: { ctx: Awaited<ReturnType<typeof requireContext>>; patientId?: string }) {
  const alerts = await pendingRiskAlerts(ctx, patientId);
  if (!alerts.length) return null;
  const t = await getTranslations("diary.alerts");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive-strong md:px-6 print:hidden">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-semibold">{t("title")}</span>
      <span>{t("description")}</span>
      <span className="flex flex-wrap gap-2">
        {alerts.slice(0, 5).map((a) => (
          <Link key={a.patientId} href={`/app/pacientes/${a.patientId}/cartao`} className="font-medium underline underline-offset-4">
            {t("patient", { name: a.fullName, count: a.count })}
          </Link>
        ))}
        {alerts.length > 5 ? <span>{t("more", { count: alerts.length - 5 })}</span> : null}
      </span>
    </div>
  );
}
