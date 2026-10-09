"use client";
import { useMemo, useState } from "react";
import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormat, useTranslations } from "@/i18n/client";
import { formatLinhaDigitavel, parseBoleto } from "@/lib/boleto";
import { ATTACHMENT_KINDS, CATEGORY_GROUPS, centsToInput, FREQUENCIES, isWeekend, isBusinessDay, PAYMENT_METHODS, WEEKEND_RULES } from "@/lib/payables";

type Category = { id: string; name: string; group: string; deductible: boolean };
type Supplier = { id: string; name: string; defaultCategoryId: string | null };

export type PayableDefaults = {
  id?: string;
  description?: string;
  supplierId?: string | null;
  categoryId?: string;
  amountCents?: number;
  dueDate?: string;
  competence?: string;
  method?: string | null;
  documentNumber?: string | null;
  barcode?: string | null;
  pixCopyPaste?: string | null;
  costCenter?: string | null;
  notes?: string | null;
  deductible?: boolean;
  inSeries?: boolean;
};

export function PayableForm({
  action,
  mode,
  categories,
  suppliers,
  defaults = {},
  today,
}: {
  action: FormAction;
  mode: "create" | "edit";
  categories: Category[];
  suppliers: Supplier[];
  defaults?: PayableDefaults;
  today: string;
}) {
  const t = useTranslations("payables.form");
  const tg = useTranslations("payables.groups");
  const tm = useTranslations("payables.methods");
  const tf = useTranslations("payables.frequencies");
  const ta = useTranslations("payables.attachmentKinds");
  const f = useFormat();

  const [supplierId, setSupplierId] = useState(defaults.supplierId ?? "");
  const [categoryId, setCategoryId] = useState(defaults.categoryId ?? "");
  const [deductible, setDeductible] = useState(defaults.deductible ?? false);
  const [amount, setAmount] = useState(defaults.amountCents ? centsToInput(defaults.amountCents) : "");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? today);
  const [competence, setCompetence] = useState(defaults.competence ?? (defaults.dueDate ?? today).slice(0, 7));
  const [competenceTouched, setCompetenceTouched] = useState(mode === "edit");
  const [barcode, setBarcode] = useState(defaults.barcode ? formatLinhaDigitavel(defaults.barcode) : "");
  const [repeat, setRepeat] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("none");
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  const byGroup = useMemo(
    () => CATEGORY_GROUPS.map((g) => ({ g, items: categories.filter((c) => c.group === g) })).filter((x) => x.items.length),
    [categories],
  );

  // Fornecedor com categoria padrão preenche a categoria (se ainda vazia); a categoria sugere o "dedutível".
  const pickSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s?.defaultCategoryId && !categoryId) pickCategory(s.defaultCategoryId);
  };
  const pickCategory = (id: string) => {
    setCategoryId(id);
    const c = categories.find((x) => x.id === id);
    if (c) setDeductible(c.deductible);
  };

  const boleto = barcode.replace(/\D/g, "").length >= 44 ? parseBoleto(barcode, today) : null;
  const onBarcode = (value: string) => {
    setBarcode(value);
    const parsed = value.replace(/\D/g, "").length >= 44 ? parseBoleto(value, today) : null;
    if (parsed && typeof parsed !== "string") {
      if (parsed.amountCents) setAmount(centsToInput(parsed.amountCents));
      if (parsed.dueDate) changeDue(parsed.dueDate);
    }
  };
  const changeDue = (v: string) => {
    setDueDate(v);
    if (!competenceTouched && /^\d{4}-\d{2}/.test(v)) setCompetence(v.slice(0, 7));
  };

  const nonBusiness = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && !isBusinessDay(dueDate);

  return (
    <ActionForm action={action} className="space-y-6">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <fieldset className="space-y-4">
        <legend className="text-card-title">{t("sectionMain")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">{t("description")}</Label>
            <Input id="description" name="description" required minLength={2} maxLength={140} defaultValue={defaults.description ?? ""} placeholder={t("descriptionPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">{t("supplier")}</Label>
            <Select id="supplierId" name="supplierId" value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
              <option value="">{t("noSupplier")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new">{t("newSupplier")}</option>
            </Select>
          </div>
          {supplierId === "__new" ? (
            <div className="space-y-1.5">
              <Label htmlFor="newSupplierName">{t("newSupplierName")}</Label>
              <Input id="newSupplierName" name="newSupplierName" required minLength={2} maxLength={120} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">{t("category")}</Label>
            <Select id="categoryId" name="categoryId" required value={categoryId} onChange={(e) => pickCategory(e.target.value)}>
              <option value="" disabled>
                {t("pickCategory")}
              </option>
              {byGroup.map(({ g, items }) => (
                <optgroup key={g} label={tg(g)}>
                  {items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">{repeat === "installments" ? t("totalAmount") : t("amount")}</Label>
            <Input id="amount" name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">{repeat === "none" ? t("dueDate") : t("firstDueDate")}</Label>
            <Input id="dueDate" name="dueDate" type="date" required value={dueDate} onChange={(e) => changeDue(e.target.value)} aria-describedby={nonBusiness ? "due-hint" : undefined} />
            {nonBusiness ? (
              <p id="due-hint" className="text-xs text-warning-strong">
                {isWeekend(dueDate) ? t("weekendHint") : t("holidayHint")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="competence">{t("competence")}</Label>
            <Input
              id="competence"
              name="competence"
              type="month"
              required
              value={competence}
              onChange={(e) => {
                setCompetence(e.target.value);
                setCompetenceTouched(true);
              }}
              aria-describedby="competence-hint"
            />
            <p id="competence-hint" className="text-xs text-muted-foreground">
              {t("competenceHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="method">{t("method")}</Label>
            <Select id="method" name="method" defaultValue={defaults.method ?? ""}>
              <option value="">{t("noMethod")}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {tm(m)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-card-title">{t("sectionPayment")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="barcode">{t("barcode")}</Label>
            <Input
              id="barcode"
              name="barcode"
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              onChange={(e) => onBarcode(e.target.value)}
              placeholder={t("barcodePlaceholder")}
              aria-describedby="barcode-hint"
              className="font-mono text-xs sm:text-sm"
            />
            <p id="barcode-hint" className={boleto === "checkDigit" || boleto === "length" ? "text-xs text-destructive-strong" : "text-xs text-muted-foreground"}>
              {boleto === "checkDigit"
                ? t("barcodeInvalid")
                : boleto === "length"
                  ? t("barcodeLength")
                  : boleto
                    ? t("barcodeRead", {
                        amount: boleto.amountCents ? f.money(boleto.amountCents / 100) : "-",
                        due: boleto.dueDate ? f.date(`${boleto.dueDate}T12:00:00`) : "-",
                      })
                    : t("barcodeHint")}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pixCopyPaste">{t("pix")}</Label>
            <Input id="pixCopyPaste" name="pixCopyPaste" autoComplete="off" defaultValue={defaults.pixCopyPaste ?? ""} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="documentNumber">{t("documentNumber")}</Label>
            <Input id="documentNumber" name="documentNumber" maxLength={60} defaultValue={defaults.documentNumber ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="costCenter">{t("costCenter")}</Label>
            <Input id="costCenter" name="costCenter" maxLength={60} defaultValue={defaults.costCenter ?? ""} placeholder={t("costCenterPlaceholder")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={defaults.notes ?? ""} />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="deductible" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              {t("deductible")}
              <span className="block text-xs text-muted-foreground">{t("deductibleHint")}</span>
            </span>
          </label>
        </div>
      </fieldset>

      {mode === "create" ? (
        <>
          <fieldset className="space-y-4">
            <legend className="text-card-title">{t("sectionRepeat")}</legend>
            <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label={t("sectionRepeat")}>
              {(["none", "installments", "recurring"] as const).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input type="radio" name="repeat" value={r} checked={repeat === r} onChange={() => setRepeat(r)} className="h-4 w-4 accent-primary" />
                  {t(`repeat.${r}`)}
                </label>
              ))}
            </div>
            {repeat !== "none" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {repeat === "installments" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="installments">{t("installments")}</Label>
                    <Input id="installments" name="installments" type="number" min={2} max={120} defaultValue={2} required />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="frequency">{t("frequency")}</Label>
                  <Select id="frequency" name="frequency" defaultValue="monthly">
                    {FREQUENCIES.map((fr) => (
                      <option key={fr} value={fr}>
                        {tf(fr)}
                      </option>
                    ))}
                  </Select>
                </div>
                {repeat === "recurring" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="recurrenceEnd">{t("recurrenceEnd")}</Label>
                    <Select id="recurrenceEnd" name="recurrenceEnd" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)}>
                      <option value="none">{t("endNone")}</option>
                      <option value="count">{t("endCount")}</option>
                      <option value="until">{t("endUntil")}</option>
                    </Select>
                  </div>
                ) : null}
                {repeat === "recurring" && recurrenceEnd === "count" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="count">{t("count")}</Label>
                    <Input id="count" name="count" type="number" min={2} max={120} defaultValue={12} required />
                  </div>
                ) : null}
                {repeat === "recurring" && recurrenceEnd === "until" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="until">{t("until")}</Label>
                    <Input id="until" name="until" type="date" min={dueDate} required />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="weekendRule">{t("weekendRule")}</Label>
                  <Select id="weekendRule" name="weekendRule" defaultValue="next">
                    {WEEKEND_RULES.map((w) => (
                      <option key={w} value={w}>
                        {t(`weekend.${w}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ) : null}
            {repeat === "recurring" && recurrenceEnd === "none" ? <p className="text-xs text-muted-foreground">{t("endNoneHint")}</p> : null}
            {repeat === "installments" ? <p className="text-xs text-muted-foreground">{t("installmentsHint")}</p> : null}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-card-title">{t("sectionExtras")}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="attachment">{t("attachment")}</Label>
                <Input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                <p className="text-xs text-muted-foreground">{t("attachmentHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="attachmentKind">{t("attachmentKind")}</Label>
                <Select id="attachmentKind" name="attachmentKind" defaultValue="boleto">
                  {ATTACHMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ta(k)}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="alreadyPaid" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="h-4 w-4 accent-primary" />
                {repeat === "none" ? t("alreadyPaid") : t("alreadyPaidFirst")}
              </label>
              {alreadyPaid ? (
                <div className="space-y-1.5">
                  <Label htmlFor="paidAt">{t("paidAt")}</Label>
                  <Input id="paidAt" name="paidAt" type="date" max={today} defaultValue={today} required />
                </div>
              ) : null}
            </div>
          </fieldset>
        </>
      ) : defaults.inSeries ? (
        <fieldset className="space-y-2">
          <legend className="text-card-title">{t("scope")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" value="one" defaultChecked className="h-4 w-4 accent-primary" />
            {t("scopeOne")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="scope" value="following" className="h-4 w-4 accent-primary" />
            {t("scopeFollowing")}
          </label>
          <p className="text-xs text-muted-foreground">{t("scopeHint")}</p>
        </fieldset>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit">{mode === "create" ? t("submitCreate") : t("submitEdit")}</Button>
      </div>
    </ActionForm>
  );
}
