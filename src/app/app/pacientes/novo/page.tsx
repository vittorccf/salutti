import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/forms/action-form";
import { PatientFields } from "../_components/patient-form";
import { createPatientAction } from "../_actions";
import { getTranslations } from "@/i18n/server";

export default async function NewPatientPage() {
  const ctx = await requireContext();
  const plans = await db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } });
  const t = await getTranslations("patients.new");
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createPatientAction} className="space-y-6">
            <PatientFields plans={plans} />
            <div className="rounded-md border p-3 bg-accent/30 text-sm flex gap-3 items-start">
              <input id="consent" name="consent" type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-primary" />
              <label htmlFor="consent" className="space-y-1">
                <span className="font-medium">{t("consentTitle")}</span>
                <p className="text-xs text-muted-foreground">{t("consentDetail")}</p>
              </label>
            </div>
            <Button type="submit">{t("submit")}</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
