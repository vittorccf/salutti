import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/forms/form-error";
import { PatientFields } from "../../_components/patient-form";
import { updatePatientAction } from "../../_actions";

export const dynamic = "force-dynamic";

export default async function EditPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const ctx = await requireContext();
  const { id } = await params;
  const { erro } = await searchParams;
  const [patient, plans] = await Promise.all([
    db.patient.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null } }),
    db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!patient) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Editar · {patient.fullName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updatePatientAction} className="space-y-6">
            <input type="hidden" name="patientId" value={patient.id} />
            <FormError message={erro} />
            <PatientFields patient={patient} plans={plans} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Salvar alterações</Button>
              <Button variant="outline" asChild>
                <Link href={`/app/pacientes/${patient.id}`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
