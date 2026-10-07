"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n/client";
import { PROCEDURE_CATEGORIES, RETURN_SUGGESTIONS } from "@/lib/procedures";
import { saveProcedureAction } from "../_actions";

type Product = { id: string; name: string; unit: string };
type Supply = { productId: string; quantity: string };
export type ProcedureDefaults = {
  id?: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: string;
  returnDays: string;
  consentText: string;
  notes: string;
  active: boolean;
  supplies: Supply[];
};

export function ProcedureForm({ defaults, products }: { defaults: ProcedureDefaults; products: Product[] }) {
  const t = useTranslations("aesthetics.form");
  const tc = useTranslations("aesthetics.categories");
  const [returnDays, setReturnDays] = useState(defaults.returnDays);
  const [supplies, setSupplies] = useState<(Supply & { key: number })[]>(defaults.supplies.map((s, i) => ({ ...s, key: i })));
  const [nextKey, setNextKey] = useState(defaults.supplies.length);
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit ?? "";

  const addSupply = () => {
    setSupplies((s) => [...s, { productId: "", quantity: "", key: nextKey }]);
    setNextKey((k) => k + 1);
  };
  const update = (key: number, patch: Partial<Supply>) => setSupplies((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <ActionForm action={saveProcedureAction} className="space-y-6">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" defaultValue={defaults.name} required minLength={2} maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">{t("category")}</Label>
          <Select id="category" name="category" defaultValue={defaults.category}>
            {PROCEDURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tc(c)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="durationMinutes">{t("duration")}</Label>
          <Input id="durationMinutes" name="durationMinutes" type="number" min={5} max={480} step={5} defaultValue={defaults.durationMinutes} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="price">{t("price")}</Label>
          <Input id="price" name="price" inputMode="decimal" defaultValue={defaults.price} placeholder={t("optional")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="returnDays">{t("returnDays")}</Label>
          <Input
            id="returnDays"
            name="returnDays"
            type="number"
            min={1}
            max={730}
            value={returnDays}
            onChange={(e) => setReturnDays(e.target.value)}
            placeholder={t("optional")}
            aria-describedby="returnDays-hint"
          />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <p id="returnDays-hint" className="text-xs text-muted-foreground">
            {t("returnHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {RETURN_SUGGESTIONS.map((s) => (
              <Button
                key={s.key}
                type="button"
                size="sm"
                variant={returnDays === String(s.days) ? "secondary" : "outline"}
                aria-pressed={returnDays === String(s.days)}
                onClick={() => setReturnDays(String(s.days))}
              >
                {t("suggestion", { label: t(`suggestions.${s.key}`), days: s.days })}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-medium">{t("kitTitle")}</legend>
        <p className="text-xs text-muted-foreground">{t("kitDescription")}</p>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("kitNoProducts")}{" "}
            <Link href="/app/estoque" className="text-brand underline-offset-4 hover:underline">
              {t("goToStock")}
            </Link>
          </p>
        ) : (
          <>
            {supplies.map((s, i) => (
              <div key={s.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <Label htmlFor={`supplyProduct-${s.key}`}>{t("kitProduct")}</Label>
                  <Select
                    id={`supplyProduct-${s.key}`}
                    name="supplyProduct"
                    value={s.productId}
                    onChange={(e) => update(s.key, { productId: e.target.value })}
                    required
                  >
                    <option value="">{t("select")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-32 space-y-1">
                  <Label htmlFor={`supplyQuantity-${s.key}`}>
                    {t("kitQuantity")}
                    {unitOf(s.productId) ? ` (${unitOf(s.productId)})` : ""}
                  </Label>
                  <Input
                    id={`supplyQuantity-${s.key}`}
                    name="supplyQuantity"
                    inputMode="decimal"
                    value={s.quantity}
                    onChange={(e) => update(s.key, { quantity: e.target.value })}
                    required
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setSupplies((x) => x.filter((y) => y.key !== s.key))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">
                    {t("kitRemove")} {i + 1}
                  </span>
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addSupply}>
              <Plus className="h-4 w-4" aria-hidden /> {t("kitAdd")}
            </Button>
          </>
        )}
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="consentText">{t("consent")}</Label>
        <Textarea id="consentText" name="consentText" rows={6} defaultValue={defaults.consentText} aria-describedby="consentText-hint" maxLength={10000} />
        <p id="consentText-hint" className="text-xs text-muted-foreground">
          {t("consentHint")}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes} maxLength={2000} placeholder={t("optional")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={defaults.active} className="h-4 w-4 accent-primary" />
        {t("active")}
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit">{defaults.id ? t("save") : t("create")}</Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/app/procedimentos">{t("cancel")}</Link>
        </Button>
      </div>
    </ActionForm>
  );
}
