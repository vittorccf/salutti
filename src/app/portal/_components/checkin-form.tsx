"use client";
import { useState } from "react";
import { Annoyed, Frown, Laugh, Meh, Smile } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { checkinAction } from "../_actions";

const ICONS = [Frown, Annoyed, Meh, Smile, Laugh];

// Check-in do dia: um toque no humor e, se quiser, ansiedade, sono e uma nota.
export function CheckinForm({
  current,
  moodLabels,
}: {
  current: { mood: number; anxiety: number | null; sleepHours: number | null; notes: string | null } | null;
  moodLabels: string[];
}) {
  const t = useTranslations("portal.checkin");
  const [mood, setMood] = useState<number | null>(current?.mood ?? null);
  return (
    <ActionForm action={checkinAction} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{current ? t("updateQuestion") : t("question")}</legend>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t("question")}>
          {ICONS.map((Icon, i) => {
            const value = i + 1;
            const selected = mood === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-[11px] font-medium leading-tight transition-colors focus-within:ring-2 focus-within:ring-ring",
                  selected ? "border-brand bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                <input type="radio" name="mood" value={value} checked={selected} onChange={() => setMood(value)} className="sr-only" />
                <Icon className={cn("h-6 w-6", selected ? "text-brand" : "text-muted-foreground")} aria-hidden />
                {moodLabels[i]}
              </label>
            );
          })}
        </div>
      </fieldset>
      <details className="rounded-lg border p-3" open={!!(current?.anxiety || current?.sleepHours || current?.notes)}>
        <summary className="cursor-pointer text-sm font-medium">{t("more")}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="anxiety">{t("anxiety")}</Label>
            <select
              id="anxiety"
              name="anxiety"
              defaultValue={current?.anxiety ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">-</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t(`anxietyLevel.${n}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sleepHours">{t("sleep")}</Label>
            <Input id="sleepHours" name="sleepHours" inputMode="decimal" defaultValue={current?.sleepHours ?? ""} placeholder="7,5" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={current?.notes ?? ""} aria-describedby="notes-hint" />
            <p id="notes-hint" className="text-xs text-muted-foreground">
              {t("notesHint")}
            </p>
          </div>
        </div>
      </details>
      <Button type="submit" disabled={!mood} className="w-full sm:w-auto">
        {current ? t("update") : t("save")}
      </Button>
    </ActionForm>
  );
}
