import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "@/i18n/server";
import { ProcedureForm } from "../_components/procedure-form";
import { isPresetKey, kitProducts, PRESETS, requireProceduresContext } from "../_lib";

export default async function NewProcedurePage({ searchParams }: { searchParams: Promise<{ sugestao?: string }> }) {
  const ctx = await requireProceduresContext({ clinical: true });
  const [t, tl] = await Promise.all([getTranslations("aesthetics.form"), getTranslations("aesthetics.list")]);
  const { sugestao } = await searchParams;
  const preset = isPresetKey(sugestao) ? PRESETS[sugestao] : null;
  const products = await kitProducts(ctx.workspace.id);

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("newTitle")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProcedureForm
            products={products}
            defaults={{
              name: isPresetKey(sugestao) ? tl(`suggestions.${sugestao}`) : "",
              category: preset?.category ?? "facial",
              durationMinutes: preset?.durationMinutes ?? 60,
              price: "",
              returnDays: preset?.returnDays ? String(preset.returnDays) : "",
              consentText: "",
              notes: "",
              active: true,
              supplies: [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
