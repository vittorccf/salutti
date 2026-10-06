import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/forms/action-form";
import { PatientFields } from "../_components/patient-form";
import { createPatientAction } from "../_actions";

export default async function NewPatientPage() {
  const ctx = await requireContext();
  const plans = await db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } });
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Novo paciente</CardTitle>
          <CardDescription>Só o nome é obrigatório. CPF e os demais dados podem ser preenchidos depois.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createPatientAction} className="space-y-6">
            <PatientFields plans={plans} />
            <div className="rounded-md border p-3 bg-accent/30 text-sm flex gap-3 items-start">
              <input id="consent" name="consent" type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-primary" />
              <label htmlFor="consent" className="space-y-1">
                <span className="font-medium">Confirmo a coleta com base na tutela da saúde (LGPD).</span>
                <p className="text-xs text-muted-foreground">
                  Art. 11, II, “f” da LGPD. O registro fica na trilha de auditoria com data, IP e quem cadastrou.
                </p>
              </label>
            </div>
            <Button type="submit">Cadastrar paciente</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
