"use client";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useTranslations } from "@/i18n/client";

type Option = { id: string; name: string; durationMinutes: number; price: number | null };

// Campo "Procedimento" da nova sessão (Salutti Estética): ao escolher, preenche duração e valor do formulário
// (campos #durationMinutes e #price da página), que continuam editáveis.
export function ProcedurePicker({ procedures, defaultValue }: { procedures: Option[]; defaultValue?: string }) {
  const t = useTranslations("aesthetics.schedule");

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = procedures.find((x) => x.id === e.target.value);
    if (!p) return;
    const form = e.target.form;
    const set = (name: string, value: string) => {
      const input = form?.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.value = value;
    };
    // A agenda aceita de 15 a 240 minutos.
    set("durationMinutes", String(Math.min(240, Math.max(15, p.durationMinutes))));
    if (p.price != null) set("price", String(p.price));
  }

  return (
    <div className="sm:col-span-2 space-y-1">
      <Label htmlFor="procedureId">{t("procedure")}</Label>
      <Select name="procedureId" id="procedureId" defaultValue={defaultValue ?? ""} onChange={onChange} aria-describedby="procedureId-hint">
        <option value="">{t("none")}</option>
        {procedures.map((p) => (
          <option key={p.id} value={p.id}>
            {t("option", { name: p.name, minutes: p.durationMinutes })}
          </option>
        ))}
      </Select>
      <p id="procedureId-hint" className="text-xs text-muted-foreground">
        {t("hint")}
      </p>
    </div>
  );
}
