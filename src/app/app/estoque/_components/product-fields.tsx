import type { Product } from "@prisma/client";
import { getTranslations } from "@/i18n/server";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PRODUCT_KINDS, UNITS } from "../_lib";

// Campos do cadastro de produto (novo e editar). Números aceitam vírgula decimal.
export async function ProductFields({ product }: { product?: Product | null }) {
  const [t, tk, tu] = await Promise.all([
    getTranslations("stock.form"),
    getTranslations("stock.kinds"),
    getTranslations("stock.unitNames"),
  ]);
  const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" required minLength={2} defaultValue={product?.name ?? ""} placeholder={t("namePlaceholder")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="brand">{t("brand")}</Label>
          <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} placeholder={t("brandPlaceholder")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="supplier">{t("supplier")}</Label>
          <Input id="supplier" name="supplier" defaultValue={product?.supplier ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kind">{t("kind")}</Label>
          <Select id="kind" name="kind" defaultValue={product?.kind ?? "insumo"}>
            {PRODUCT_KINDS.map((k) => (
              <option key={k} value={k}>
                {tk(k)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t("kindHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="unit">{t("unit")}</Label>
          <Select id="unit" name="unit" defaultValue={product?.unit ?? "un"}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {tu(u)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{t("unitHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="anvisaRegistry">{t("anvisaRegistry")}</Label>
          <Input id="anvisaRegistry" name="anvisaRegistry" defaultValue={product?.anvisaRegistry ?? ""} inputMode="numeric" />
          <p className="text-xs text-muted-foreground">{t("anvisaHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="unitCost">{t("unitCost")}</Label>
          <Input id="unitCost" name="unitCost" inputMode="decimal" defaultValue={num(product?.unitCost)} placeholder="0,00" />
          <p className="text-xs text-muted-foreground">{t("unitCostHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="minStock">{t("minStock")}</Label>
          <Input id="minStock" name="minStock" inputMode="decimal" defaultValue={num(product?.minStock)} placeholder="0" />
          <p className="text-xs text-muted-foreground">{t("minStockHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="openShelfLifeHours">{t("openShelfLifeHours")}</Label>
          <Input
            id="openShelfLifeHours"
            name="openShelfLifeHours"
            inputMode="numeric"
            defaultValue={product?.openShelfLifeHours ?? ""}
            placeholder={t("openShelfLifePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("openShelfLifeHint")}</p>
        </div>
      </div>
      {product ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4 accent-primary" />
          {t("active")}
        </label>
      ) : null}
    </div>
  );
}
