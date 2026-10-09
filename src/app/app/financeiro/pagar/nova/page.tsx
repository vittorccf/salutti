import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { dateKeySP } from "@/lib/dates";
import { getTranslations } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayableForm, type PayableDefaults } from "../_components/payable-form";
import { createPayableAction } from "../_actions";
import { formOptions, requirePayables } from "../_lib";

// "?de=<id>": duplicar uma conta (mesmos dados, vencimento de hoje, sem boleto nem Pix).
export default async function NewPayablePage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const ctx = await requirePayables();
  const t = await getTranslations("payables.new");
  const { de } = await searchParams;
  const { categories, suppliers } = await formOptions(ctx.workspace.id);
  const source = de ? await db.payable.findFirst({ where: { id: de, workspaceId: ctx.workspace.id } }) : null;
  const today = dateKeySP();
  const defaults: PayableDefaults = source
    ? {
        description: source.description,
        supplierId: source.supplierId,
        categoryId: source.categoryId,
        amountCents: source.amountCents,
        method: source.method,
        costCenter: source.costCenter,
        notes: source.notes,
        deductible: source.deductible,
      }
    : {};

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/financeiro/pagar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{source ? t("titleDuplicate") : t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PayableForm action={createPayableAction} mode="create" categories={categories} suppliers={suppliers} defaults={defaults} today={today} />
        </CardContent>
      </Card>
    </div>
  );
}
