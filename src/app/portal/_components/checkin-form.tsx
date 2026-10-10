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
import { ACTIVITIES, EMOTIONS, MAX_EMOTIONS, type DiaryItem, type DiaryQuestion } from "@/lib/diary";
import { checkinAction } from "../_actions";

const ICONS = [Frown, Annoyed, Meh, Smile, Laugh];
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Current = {
  mood: number;
  anxiety: number | null;
  energy: number | null;
  medication: boolean | null;
  sleepHours: number | null;
  emotions: string[];
  activities: string[];
  answers: Record<string, unknown> | null;
  notes: string | null;
};

const chip = (on: boolean, disabled = false) =>
  cn(
    "inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-ring",
    on ? "border-brand bg-accent text-accent-foreground" : "hover:bg-accent/50",
    disabled && !on && "cursor-not-allowed opacity-50",
  );

// Check-in do dia: um toque no humor e, se quiser, os itens que o profissional ligou para você.
export function CheckinForm({ current, moodLabels, items, questions }: { current: Current | null; moodLabels: string[]; items: DiaryItem[]; questions: DiaryQuestion[] }) {
  const t = useTranslations("portal.checkin");
  const td = useTranslations("diary.client");
  const [mood, setMood] = useState<number | null>(current?.mood ?? null);
  const [emotions, setEmotions] = useState<string[]>(current?.emotions ?? []);
  const [activities, setActivities] = useState<string[]>(current?.activities ?? []);
  const has = (i: DiaryItem) => items.includes(i);
  const extras = items.length > 0 || questions.length > 0;
  const answer = (id: string) => current?.answers?.[id];
  const toggle = (list: string[], set: (v: string[]) => void, v: string, max = Infinity) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  return (
    <ActionForm action={checkinAction} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{current ? t("updateQuestion") : t("question")}</legend>
        <div className="grid grid-cols-5 gap-2">
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

      {has("emotions") ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{td("emotions")}</legend>
          <p className="text-xs text-muted-foreground">{td("emotionsHint", { max: MAX_EMOTIONS })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(EMOTIONS).map(([quadrant, keys]) => (
              <div key={quadrant} className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{td(`quadrants.${quadrant}`)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {keys.map((k) => {
                    const on = emotions.includes(k);
                    const disabled = !on && emotions.length >= MAX_EMOTIONS;
                    return (
                      <label key={k} className={chip(on, disabled)}>
                        <input type="checkbox" name="emotions" value={k} checked={on} disabled={disabled} onChange={() => toggle(emotions, setEmotions, k, MAX_EMOTIONS)} className="sr-only" />
                        {td(`emotion.${k}`)}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {has("activities") ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{td("activities")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITIES.map((k) => {
              const on = activities.includes(k);
              return (
                <label key={k} className={chip(on)}>
                  <input type="checkbox" name="activities" value={k} checked={on} onChange={() => toggle(activities, setActivities, k)} className="sr-only" />
                  {td(`activity.${k}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {extras && (has("anxiety") || has("energy") || has("sleep") || has("medication") || has("notes") || questions.length) ? (
        <details className="rounded-lg border p-3" open={!!(current?.anxiety || current?.energy || current?.sleepHours || current?.medication !== null && current?.medication !== undefined || current?.notes || current?.answers)}>
          <summary className="cursor-pointer text-sm font-medium">{t("more")}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {has("anxiety") ? (
              <div className="space-y-1.5">
                <Label htmlFor="anxiety">{t("anxiety")}</Label>
                <select id="anxiety" name="anxiety" defaultValue={current?.anxiety ?? ""} className={selectClass}>
                  <option value="">-</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {t(`anxietyLevel.${n}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {has("energy") ? (
              <div className="space-y-1.5">
                <Label htmlFor="energy">{td("energy")}</Label>
                <select id="energy" name="energy" defaultValue={current?.energy ?? ""} className={selectClass}>
                  <option value="">-</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {td(`energyLevel.${n}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {has("sleep") ? (
              <div className="space-y-1.5">
                <Label htmlFor="sleepHours">{t("sleep")}</Label>
                <Input id="sleepHours" name="sleepHours" inputMode="decimal" defaultValue={current?.sleepHours ?? ""} placeholder="7,5" />
              </div>
            ) : null}
            {has("medication") ? (
              <div className="space-y-1.5">
                <Label htmlFor="medication">{td("medication")}</Label>
                <select id="medication" name="medication" defaultValue={current?.medication === true ? "sim" : current?.medication === false ? "nao" : ""} className={selectClass}>
                  <option value="">-</option>
                  <option value="sim">{td("yes")}</option>
                  <option value="nao">{td("no")}</option>
                </select>
              </div>
            ) : null}
            {questions.map((q) => {
              const id = `q_${q.id}`;
              const value = answer(q.id);
              return (
                <div key={q.id} className={cn("space-y-1.5", q.type === "text" && "sm:col-span-2")}>
                  <Label htmlFor={id}>{q.label}</Label>
                  {q.type === "scale" ? (
                    <select id={id} name={id} defaultValue={typeof value === "number" ? value : ""} className={selectClass} aria-describedby={`${id}-hint`}>
                      <option value="">-</option>
                      {Array.from({ length: 11 }, (_, n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : q.type === "yesno" ? (
                    <select id={id} name={id} defaultValue={value === true ? "sim" : value === false ? "nao" : ""} className={selectClass}>
                      <option value="">-</option>
                      <option value="sim">{td("yes")}</option>
                      <option value="nao">{td("no")}</option>
                    </select>
                  ) : q.type === "number" ? (
                    <Input id={id} name={id} inputMode="decimal" defaultValue={typeof value === "number" ? value : ""} />
                  ) : (
                    <Input id={id} name={id} maxLength={280} defaultValue={typeof value === "string" ? value : ""} />
                  )}
                  {q.type === "scale" ? (
                    <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                      {td("scaleHint")}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {has("notes") ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">{t("notes")}</Label>
                <Textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={current?.notes ?? ""} aria-describedby="notes-hint" />
                <p id="notes-hint" className="text-xs text-muted-foreground">
                  {t("notesHint")}
                </p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      <Button type="submit" disabled={!mood} className="w-full sm:w-auto">
        {current ? t("update") : t("save")}
      </Button>
    </ActionForm>
  );
}
