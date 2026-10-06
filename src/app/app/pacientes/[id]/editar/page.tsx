import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/forms/action-form";
import { PatientFields } from "../../_components/patient-form";
import { updatePatientAction } from "../../_actions";
import { getTranslations } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const patient = await db.patient.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!patient) notFound();
  // O plano atual entra na lista mesmo se foi desativado, para a edição não trocá-lo por "Particular".
  const plans = await db.insurancePlan.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      OR: [{ active: true }, ...(patient.insurancePlanId ? [{ id: patient.insurancePlanId }] : [])],
    },
    orderBy: { name: "asc" },
  });
  const [t, tActions] = await Promise.all([getTranslations("patients.edit"), getTranslations("common.actions")]);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title", { name: patient.fullName })}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updatePatientAction} className="space-y-6">
            <input type="hidden" name="patientId" value={patient.id} />
            <PatientFields patient={patient} plans={plans} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{tActions("saveChanges")}</Button>
              <Button variant="outline" asChild>
                <Link href={`/app/pacientes/${patient.id}`}>{tActions("cancel")}</Link>
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
