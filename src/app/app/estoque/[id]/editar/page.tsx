import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductFields } from "../../_components/product-fields";
import { saveProductAction } from "../../_actions";
import { requireStock } from "../../_lib";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStock("manage");
  const { id } = await params;
  const product = await db.product.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!product) notFound();
  const [t, ta] = await Promise.all([getTranslations("stock.form"), getTranslations("common.actions")]);
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle", { name: product.name })}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveProductAction} className="space-y-6">
            <input type="hidden" name="id" value={product.id} />
            <ProductFields product={product} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{ta("saveChanges")}</Button>
              <Button variant="outline" asChild>
                <Link href={`/app/estoque/${product.id}`}>{ta("cancel")}</Link>
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
