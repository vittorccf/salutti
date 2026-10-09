import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { getTranslations } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayableForm } from "../../_components/payable-form";
import { updatePayableAction } from "../../_actions";
import { formOptions, requirePayables } from "../../_lib";

export default async function EditPayablePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePayables();
  const t = await getTranslations("payables.edit");
  const { id } = await params;
  const p = await db.payable.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!p || p.cancelledAt) notFound();
  // Categoria e fornecedor desativados continuam aparecendo para a conta que já os usa.
  const { categories: allCategories, suppliers } = await formOptions(ctx.workspace, { categoryId: p.categoryId, supplierId: p.supplierId });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/app/financeiro/pagar/${p.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{p.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <PayableForm
            action={updatePayableAction}
            mode="edit"
            categories={allCategories}
            suppliers={suppliers}
            today={dateKeySP()}
            defaults={{
              id: p.id,
              description: p.description,
              supplierId: p.supplierId,
              categoryId: p.categoryId,
              amountCents: p.amountCents,
              dueDate: dateKeySP(p.dueDate),
              competence: dateKeySP(p.competenceDate).slice(0, 7),
              method: p.method,
              documentNumber: p.documentNumber,
              barcode: p.barcode,
              pixCopyPaste: p.pixCopyPaste,
              costCenter: p.costCenter,
              notes: p.notes,
              deductible: p.deductible,
              inSeries: !!p.seriesId,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
