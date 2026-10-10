import { ClipboardCheck, LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { addDaysKey } from "@/lib/payables";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import { diarySetup, instrumentDue, INSTRUMENTS, type InstrumentId } from "@/lib/diary";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckinForm } from "./checkin-form";
import { diaryConsentAction, diaryRevokeAction, instrumentAction } from "../_actions";

// Aviso fixo do cartão: ninguém lê em tempo real; em crise, CVV/SAMU.
export async function CrisisNotice({ strong = false }: { strong?: boolean }) {
  const t = await getTranslations("diary");
  return (
    <p role="note" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${strong ? "border-destructive/40 bg-destructive/10 text-destructive-strong" : "border-warning/40 bg-warning/10 text-warning-strong"}`}>
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {t("notice")}
    </p>
  );
}

// Tela de apoio depois de um questionário com sinal de risco (PHQ-9 item 9).
export async function SupportCard() {
  const t = await getTranslations("diary.support");
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-2">
          <li>
            <a href="tel:188" className="font-semibold text-brand underline-offset-4 hover:underline">
              {t("cvv")}
            </a>
          </li>
          <li>
            <a href="tel:192" className="font-semibold text-brand underline-offset-4 hover:underline">
              {t("samu")}
            </a>
          </li>
          <li>{t("upa")}</li>
        </ul>
        <p className="text-muted-foreground">{t("professional")}</p>
      </CardContent>
    </Card>
  );
}

function InstrumentForm({ id, t }: { id: InstrumentId; t: (k: string, v?: Record<string, string | number>) => string }) {
  const def = INSTRUMENTS[id];
  const options = Array.from({ length: def.max - def.min + 1 }, (_, i) => def.min + i);
  // WHO-5 lista da melhor para a pior resposta (5 → 0), como no original.
  const ordered = id === "who5" ? [...options].reverse() : options;
  return (
    <ActionForm action={instrumentAction} className="space-y-4">
      <input type="hidden" name="instrument" value={id} />
      <p className="text-sm font-medium">{t(`${id}.prompt`)}</p>
      <ol className="space-y-4">
        {Array.from({ length: def.items }, (_, i) => (
          <li key={i}>
            <fieldset className="space-y-2">
              <legend className="text-sm">
                {i + 1}. {t(`${id}.i${i + 1}`)}
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {ordered.map((v) => (
                  <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50 has-[:checked]:border-brand has-[:checked]:bg-accent">
                    <input type="radio" name={`i${i + 1}`} value={v} required className="h-4 w-4 accent-primary" />
                    {t(`${id}.o${v}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t("credit")}</p>
      <Button type="submit">{t("submit")}</Button>
    </ActionForm>
  );
}

// Bloco do cartão diário no portal: aceite → check-in do dia → últimos 7 dias → questionário que venceu.
export async function DiarySection({ patientId }: { patientId: string }) {
  const today = dateKeySP();
  const monthStart = `${today.slice(0, 8)}01`;
  const [t, td, ti, f, label, config, cards, monthCount, lastResponses] = await Promise.all([
    getTranslations("portal.week"),
    getTranslations("diary"),
    getTranslations("diary.instrument"),
    getFormat(),
    getTranslations("common.labels").then(labeler),
    db.diaryConfig.findUnique({ where: { patientId } }),
    db.dailyCard.findMany({ where: { patientId, date: { gte: parseDateOnly(addDaysKey(today, -6)) } }, orderBy: { date: "asc" } }),
    db.dailyCard.count({ where: { patientId, date: { gte: parseDateOnly(monthStart) } } }),
    db.instrumentResponse.groupBy({ by: ["instrument"], where: { patientId }, _max: { createdAt: true } }),
  ]);
  const setup = diarySetup(config);

  if (!setup.patientConsentAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{td("consent.title")}</CardTitle>
          <CardDescription>{td("consent.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{td("consent.who")}</li>
            <li>{td("consent.realtime")}</li>
            <li>{td("consent.optional")}</li>
          </ul>
          <CrisisNotice />
          <ActionForm action={diaryConsentAction} className="space-y-3">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-primary" />
              <span>{td("consent.accept")}</span>
            </label>
            <Button type="submit">{td("consent.submit")}</Button>
          </ActionForm>
        </CardContent>
      </Card>
    );
  }

  const todayCard = cards.find((c) => dateKeySP(c.date) === today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i - 6);
    return { key, card: cards.find((c) => dateKeySP(c.date) === key) };
  });
  const lastOf = (id: string) => lastResponses.find((r) => r.instrument === id)?._max.createdAt ?? null;
  const due = setup.instruments.find((id) => instrumentDue(lastOf(id), setup.instrumentEveryDays));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("checkinTitle")}</CardTitle>
          <CardDescription>{t("checkinDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CheckinForm
            current={
              todayCard
                ? {
                    mood: todayCard.mood,
                    anxiety: todayCard.anxiety,
                    energy: todayCard.energy,
                    medication: todayCard.medication,
                    sleepHours: todayCard.sleepHours,
                    emotions: todayCard.emotions,
                    activities: todayCard.activities,
                    answers: (todayCard.answers as Record<string, unknown> | null) ?? null,
                    notes: todayCard.notes,
                  }
                : null
            }
            moodLabels={[1, 2, 3, 4, 5].map((n) => label("mood", n))}
            items={setup.items}
            questions={setup.questions}
          />
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("last7")}</p>
            <ol className="grid grid-cols-7 gap-1.5">
              {week.map(({ key, card }) => (
                <li key={key} className="flex flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted" aria-hidden>
                    <div className="w-full rounded-md bg-brand/80" style={{ height: card ? `${card.mood * 20}%` : "0%" }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{f.weekdayShort(`${key}T12:00:00Z`)}</span>
                  <span className="sr-only">{card ? `${f.date(`${key}T12:00:00Z`)}: ${label("mood", card.mood)}` : `${f.date(`${key}T12:00:00Z`)}: ${t("noCheckin")}`}</span>
                </li>
              ))}
            </ol>
            {/* Sem sequência nem "perdeu o dia": só quantos registros houve no mês. */}
            <p className="mt-2 text-xs text-muted-foreground">{td("monthCount", { count: monthCount })}</p>
          </div>
          <CrisisNotice />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">{td("revoke.title")}</summary>
            <ActionForm action={diaryRevokeAction} className="mt-2 space-y-2">
              <p>{td("revoke.description")}</p>
              <Button type="submit" variant="outline" size="sm">
                {td("revoke.submit")}
              </Button>
            </ActionForm>
          </details>
        </CardContent>
      </Card>

      {due ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-brand" aria-hidden /> {ti("title", { name: ti(`${due}.name`) })}
            </CardTitle>
            <CardDescription>{ti("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <InstrumentForm id={due} t={ti} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
