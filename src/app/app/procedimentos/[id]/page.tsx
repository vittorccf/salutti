import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocale, getTranslations } from "@/i18n/server";
import { quantityInput } from "@/lib/procedures";
import { ProcedureForm } from "../_components/procedure-form";
import { kitProducts, requireProceduresContext } from "../_lib";

export const dynamic = "force-dynamic";

export default async function EditProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireProceduresContext({ clinical: true });
  const { id } = await params;
  const [t, locale] = await Promise.all([getTranslations("aesthetics.form"), getLocale()]);
  const procedure = await db.procedure.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { supplies: true },
  });
  if (!procedure) notFound();
  const products = await kitProducts(ctx.workspace.id);
  // Produto do kit que foi desativado no estoque continua aparecendo para não sumir do kit sem aviso.
  const missing = procedure.supplies.filter((s) => !products.some((p) => p.id === s.productId)).map((s) => s.productId);
  const extra = missing.length
    ? await db.product.findMany({ where: { id: { in: missing }, workspaceId: ctx.workspace.id }, select: { id: true, name: true, unit: true } })
    : [];

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProcedureForm
            products={[...products, ...extra]}
            defaults={{
              id: procedure.id,
              name: procedure.name,
              category: procedure.category,
              durationMinutes: procedure.durationMinutes,
              price: procedure.price != null ? quantityInput(procedure.price, locale) : "",
              returnDays: procedure.returnDays ? String(procedure.returnDays) : "",
              consentText: procedure.consentText ?? "",
              notes: procedure.notes ?? "",
              active: procedure.active,
              supplies: procedure.supplies.map((s) => ({ productId: s.productId, quantity: quantityInput(s.quantity, locale) })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
