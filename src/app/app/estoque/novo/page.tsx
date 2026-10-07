import Link from "next/link";
import { getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductFields } from "../_components/product-fields";
import { saveProductAction } from "../_actions";
import { requireStock } from "../_lib";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireStock("manage");
  const [t, ta] = await Promise.all([getTranslations("stock.form"), getTranslations("common.actions")]);
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("newTitle")}</CardTitle>
          <CardDescription>{t("newDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveProductAction} className="space-y-6">
            <ProductFields />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{t("create")}</Button>
              <Button variant="outline" asChild>
                <Link href="/app/estoque">{ta("cancel")}</Link>
              </Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
