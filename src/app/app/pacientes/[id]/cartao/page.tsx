import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { addDaysKey } from "@/lib/payables";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import {
  ACTIVITIES,
  associationStrength,
  DIARY_ITEMS,
  type DiaryItem,
  diarySetup,
  INSTRUMENT_IDS,
  INSTRUMENT_INTERVALS,
  instrumentMax,
  INSTRUMENTS,
  isInstrument,
  MAX_QUESTIONS,
  MIN_DAYS_EACH,
  MIN_PAIRS,
  moodWithAndWithout,
  movingAverage,
  pearson,
  QUESTION_LABEL_MAX,
  QUESTION_TYPES,
  tagCounts,
  TEMPLATE_KEYS,
} from "@/lib/diary";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { ActionForm } from "@/components/forms/action-form";
import { PrintButton } from "@/components/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DiaryChart } from "./_components/diary-chart";
import { applyTemplateAction, reviewRiskAction, saveSetupAction } from "./_actions";
import { requireDiaryPatient } from "./_lib";

export const dynamic = "force-dynamic";

const PERIODS = [30, 90] as const;
const PIXEL_WEEKS = 12;
// Faixa de gravidade → cor do selo (do leve ao grave).
const BAND_VARIANT: Record<string, "success" | "muted" | "warning" | "destructive"> = {
  minimo: "success",
  adequado: "success",
  leve: "muted",
  moderado: "warning",
  baixo: "warning",
  moderadamente_grave: "destructive",
  grave: "destructive",
  muito_baixo: "destructive",
};
const pixelColor = (mood: number) => `hsl(var(--brand) / ${0.15 + (mood - 1) * 0.2})`;

export default async function DiaryProPage({ params, searchParams }: { params: { id: string }; searchParams: { periodo?: string; modelo?: string; v?: string; protocolo?: string } }) {
  const { ctx, patient } = await requireDiaryPatient(params.id);
  const period = PERIODS.find((p) => String(p) === searchParams.periodo) ?? 30;
  const today = dateKeySP();
  const from = addDaysKey(today, -(period - 1));
  // Pixels: semanas inteiras começando na segunda-feira, para cada linha ser um dia da semana.
  const rawStart = addDaysKey(today, -(PIXEL_WEEKS * 7 - 1));
  const pixelStart = addDaysKey(rawStart, -((new Date(`${rawStart}T12:00:00Z`).getUTCDay() + 6) % 7));
  const loadFrom = pixelStart < from ? pixelStart : from;
  const [t, tc, ti, f, label, config, allCards, responses] = await Promise.all([
    getTranslations("diary.pro"),
    getTranslations("diary.client"),
    getTranslations("diary.instrument"),
    getFormat(),
    getTranslations("common.labels").then(labeler),
    db.diaryConfig.findUnique({ where: { patientId: patient.id } }),
    db.dailyCard.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id, date: { gte: parseDateOnly(loadFrom) } }, orderBy: { date: "asc" } }),
    db.instrumentResponse.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const setup = diarySetup(config);
  const on = (i: DiaryItem) => setup.items.includes(i);
  const cards = allCards.filter((c) => dateKeySP(c.date) >= from);
  const byDay = new Map(allCards.map((c) => [dateKeySP(c.date), c]));

  // Série diária do período (dias sem registro ficam vazios, não zero).
  const dayMonth = new Intl.DateTimeFormat(f.locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const days = Array.from({ length: period }, (_, i) => addDaysKey(from, i));
  const moods = days.map((k) => byDay.get(k)?.mood ?? null);
  const avg7 = movingAverage(moods);
  const chart = days.map((k, i) => ({ label: dayMonth.format(new Date(`${k}T12:00:00Z`)), mood: moods[i], avg: avg7[i], anxiety: byDay.get(k)?.anxiety ?? null }));
  const mean = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const moodAvg = mean(cards.map((c) => c.mood));
  const sleepAvg = mean(cards.map((c) => c.sleepHours));
  const sleepPairs = cards.filter((c) => c.sleepHours !== null).map((c) => [c.sleepHours!, c.mood] as [number, number]);
  const r = pearson(sleepPairs);
  const strength = associationStrength(r);
  const activityEffects = ACTIVITIES.map((a) => ({ a, eff: moodWithAndWithout(cards.map((c) => ({ mood: c.mood, tags: c.activities })), a) })).filter((x) => x.eff);
  const emotionTop = tagCounts(cards.map((c) => c.emotions)).slice(0, 6);
  const lowDays = cards.filter((c) => c.mood <= 2).length;
  const medDays = cards.filter((c) => c.medication !== null);
  const risks = responses.filter((x) => x.riskFlag && !x.reviewedAt);
  const reviewerIds = [...new Set(responses.map((x) => x.reviewedById).filter((x): x is string => !!x))];
  const reviewers = reviewerIds.length ? await db.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } }) : [];
  const answered = cards.filter((c) => c.answers && typeof c.answers === "object").slice(-14).reverse();
  const answeredIds = new Set(answered.flatMap((c) => Object.keys(c.answers as Record<string, unknown>)));
  // Colunas: perguntas ativas e as arquivadas que têm resposta no período.
  const answerColumns = setup.allQuestions.filter((q) => !q.archived || answeredIds.has(q.id));
  const notes = cards.filter((c) => c.notes).slice(-10).reverse();
  const pixelDays: string[] = [];
  for (let k = pixelStart; k <= today; k = addDaysKey(k, 1)) pixelDays.push(k);
  const pixelLogged = pixelDays.filter((k) => byDay.has(k)).length;
  const portalActive = !!patient.portalAccess?.active && !!patient.portalAccess.activatedAt;

  return (
    <div className="space-y-6">
      <Link href={`/app/pacientes/${patient.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {patient.fullName}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">{t("title", { name: patient.fullName })}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" asChild>
            <a href={`/app/pacientes/${patient.id}/cartao/csv`} download>
              <Download className="h-4 w-4" aria-hidden /> {t("exportCsv")}
            </a>
          </Button>
          <PrintButton label={t("print")} />
        </div>
      </header>

      {risks.length ? (
        <section role="alert" className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-strong">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {t("risk.title")}
          </p>
          <p>{t("risk.description")}</p>
          <ul className="space-y-2">
            {risks.map((x) => (
              <li key={x.id} className="space-y-2 rounded-lg bg-background/60 p-3 text-foreground">
                <p>{t("risk.item", { date: f.dateTime(x.createdAt), answer: ti(`phq9.o${x.answers[8]}`) })}</p>
                <ActionForm action={reviewRiskAction} className="space-y-2 print:hidden">
                  <input type="hidden" name="patientId" value={patient.id} />
                  <input type="hidden" name="responseId" value={x.id} />
                  <Label htmlFor={`note-${x.id}`}>{t("risk.noteLabel")}</Label>
                  <Textarea id={`note-${x.id}`} name="note" rows={2} maxLength={1000} placeholder={t("risk.notePlaceholder")} />
                  <Button type="submit" size="sm">
                    {t("risk.review")}
                  </Button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!setup.patientConsentAt ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{portalActive ? t("waitingConsent") : t("noPortal")}</p>
      ) : null}

      <nav aria-label={t("periodLabel")} className="flex gap-2 print:hidden">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/app/pacientes/${patient.id}/cartao?periodo=${p}`}
            aria-current={period === p ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${period === p ? "border-brand bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("period", { days: p })}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("summary.days"), value: t("summary.daysValue", { count: cards.length, total: period }) },
          { label: t("summary.mood"), value: moodAvg === null ? "-" : `${f.number(moodAvg)} / 5` },
          { label: t("summary.lowDays"), value: String(lowDays) },
          on("medication") && medDays.length
            ? { label: t("summary.medication"), value: t("summary.medicationValue", { count: medDays.filter((c) => c.medication).length, total: medDays.length }) }
            : { label: t("summary.sleep"), value: sleepAvg === null ? "-" : t("summary.hours", { hours: f.number(sleepAvg) }) },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("chartTitle")}</CardTitle>
          <CardDescription>{t("chartDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {cards.length ? (
            <div role="img" aria-label={t("chartAria", { count: cards.length, avg: moodAvg === null ? "-" : f.number(moodAvg), low: lowDays })}>
              <DiaryChart data={chart} showAnxiety={cards.some((c) => c.anxiety !== null)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{t("pixels.title", { weeks: PIXEL_WEEKS })}</CardTitle>
            <CardDescription>{t("pixels.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="grid grid-rows-7 gap-1 text-[10px] leading-4 text-muted-foreground" aria-hidden>
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i}>{f.weekdayShort(`${addDaysKey(pixelStart, i)}T12:00:00Z`)}</span>
                ))}
              </div>
              <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label={t("pixels.aria", { count: pixelLogged, total: pixelDays.length })}>
                {pixelDays.map((k) => {
                  const m = byDay.get(k)?.mood;
                  return <span key={k} title={`${f.date(`${k}T12:00:00Z`)}: ${m ? label("mood", m) : "-"}`} className="h-4 w-4 rounded-sm" style={{ background: m ? pixelColor(m) : "hsl(var(--muted))" }} />;
                })}
              </div>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              {t("pixels.low")}
              {[1, 2, 3, 4, 5].map((m) => (
                <span key={m} className="h-3 w-3 rounded-sm" style={{ background: pixelColor(m) }} aria-hidden />
              ))}
              {t("pixels.high")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("patterns.title")}</CardTitle>
            <CardDescription>{t("patterns.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {on("sleep") ? (
              <p>
                {strength === null
                  ? t("patterns.sleepNotEnough", { min: MIN_PAIRS, count: sleepPairs.length })
                  : t(`patterns.sleep_${strength}`, { r: f.number(r!), n: sleepPairs.length, direction: r! >= 0 ? t("patterns.positive") : t("patterns.negative") })}
              </p>
            ) : null}
            {activityEffects.length ? (
              <ul className="space-y-1">
                {activityEffects.map(({ a, eff }) => (
                  <li key={a}>{t("patterns.activity", { activity: tc(`activity.${a}`), with: f.number(eff!.with), without: f.number(eff!.without), days: eff!.days })}</li>
                ))}
              </ul>
            ) : on("activities") ? (
              <p className="text-muted-foreground">{t("patterns.activityNotEnough", { min: MIN_DAYS_EACH })}</p>
            ) : null}
            {emotionTop.length ? (
              <div>
                <p className="mb-1 font-medium">{t("patterns.emotions")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {emotionTop.map(([e, n]) => (
                    <Badge key={e} variant="outline">
                      {tc(`emotion.${e}`)} · {n}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("instruments.title")}</CardTitle>
          <CardDescription>{t("instruments.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {responses.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{setup.instruments.length ? t("instruments.none") : t("instruments.off")}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t("instruments.date")}</TH>
                  <TH>{t("instruments.name")}</TH>
                  <TH className="text-right">{t("instruments.score")}</TH>
                  <TH>{t("instruments.band")}</TH>
                </TR>
              </THead>
              <TBody>
                {responses.map((x) => (
                  <TR key={x.id}>
                    <TD className="whitespace-nowrap">{f.date(x.createdAt)}</TD>
                    <TD>{isInstrument(x.instrument) ? ti(`${x.instrument}.name`) : x.instrument}</TD>
                    <TD className="text-right tabular-nums">{isInstrument(x.instrument) ? `${x.score} / ${instrumentMax(x.instrument)}` : x.score}</TD>
                    <TD>
                      <Badge variant={BAND_VARIANT[x.band] ?? "muted"}>{ti(`bands.${x.band}`)}</Badge>
                      {x.riskFlag ? (
                        <Badge variant="destructive" className="ml-1">
                          {t("instruments.item9")}
                        </Badge>
                      ) : null}
                      {x.reviewedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("instruments.conduct", { name: reviewers.find((u) => u.id === x.reviewedById)?.name ?? "-", date: f.dateTime(x.reviewedAt) })}
                          {x.reviewNote ? `: ${x.reviewNote}` : ""}
                        </p>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <p className="px-6 py-3 text-xs text-muted-foreground">{ti("credit")}</p>
        </CardContent>
      </Card>

      {answerColumns.length && answered.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("answers.title")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("instruments.date")}</TH>
                  {answerColumns.map((q) => (
                    <TH key={q.id}>{q.archived ? t("answers.archived", { label: q.label }) : q.label}</TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {answered.map((c) => {
                  const a = c.answers as Record<string, unknown>;
                  return (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap">{f.date(c.date)}</TD>
                      {answerColumns.map((q) => (
                        <TD key={q.id}>{a[q.id] === true ? tc("yes") : a[q.id] === false ? tc("no") : a[q.id] === undefined ? "-" : String(a[q.id])}</TD>
                      ))}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {notes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("notesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {notes.map((c) => (
                <li key={c.id} className="px-6 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    {f.date(c.date)} · {label("mood", c.mood)}
                  </span>
                  <p>{c.notes}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Rodapé do relatório impresso. */}
      <p className="hidden text-xs text-muted-foreground print:block">{t("printFooter", { date: f.dateTime(new Date()) })}</p>

      {/* Personalização: modelos e itens deste paciente */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>{t("setup.title")}</CardTitle>
          <CardDescription>{t("setup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("setup.templates")}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TEMPLATE_KEYS.map((k) => (
                <ActionForm key={k} action={applyTemplateAction}>
                  <input type="hidden" name="patientId" value={patient.id} />
                  <input type="hidden" name="template" value={k} />
                  <input type="hidden" name="periodo" value={period} />
                  <button
                    type="submit"
                    className={`h-full w-full rounded-xl border p-3 text-left text-sm transition-colors hover:bg-accent/50 ${setup.template === k ? "border-brand bg-accent" : ""}`}
                  >
                    <span className="block font-medium">{t(`templates.${k}.name`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`templates.${k}.description`)}</span>
                  </button>
                </ActionForm>
              ))}
            </div>
          </div>

          {searchParams.modelo && TEMPLATE_KEYS.includes(searchParams.modelo) ? (
            <p role="status" className="rounded-md bg-success/10 p-3 text-sm text-success-strong">
              {t("templateApplied", { name: t(`templates.${searchParams.modelo}.name`) })}
              {searchParams.protocolo ? ` ${t("templateNeedsAck")}` : ""}
            </p>
          ) : null}
          {/* key: depois de aplicar um modelo, recria o formulário (caixas não controladas guardariam o estado antigo). */}
          <ActionForm key={searchParams.v ?? "setup"} action={saveSetupAction} className="space-y-5">
            <input type="hidden" name="patientId" value={patient.id} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("setup.items")}</legend>
              <p className="text-xs text-muted-foreground">{t("setup.itemsHint")}</p>
              <div className="flex flex-wrap gap-3">
                {DIARY_ITEMS.map((i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="items" value={i} defaultChecked={on(i)} className="h-4 w-4 accent-primary" />
                    {t(`items.${i}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("setup.questions", { max: MAX_QUESTIONS })}</legend>
              <p className="text-xs text-muted-foreground">{t("setup.questionsHint")}</p>
              <div className="space-y-2">
                {Array.from({ length: MAX_QUESTIONS }, (_, i) => {
                  const q = setup.questions[i];
                  return (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_180px]">
                      <input type="hidden" name={`qId${i}`} value={q?.id ?? ""} />
                      <Input
                        name={`qLabel${i}`}
                        defaultValue={q?.label ?? ""}
                        maxLength={QUESTION_LABEL_MAX}
                        placeholder={t("setup.questionPlaceholder")}
                        aria-label={t("setup.questionLabel", { n: i + 1 })}
                      />
                      <Select name={`qType${i}`} defaultValue={q?.type ?? "scale"} aria-label={t("setup.questionType", { n: i + 1 })}>
                        {QUESTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`questionTypes.${type}`)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("setup.instruments")}</legend>
              <p className="text-xs text-muted-foreground">{t("setup.instrumentsHint")}</p>
              <div className="flex flex-wrap gap-3">
                {INSTRUMENT_IDS.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="instruments" value={id} defaultChecked={setup.instruments.includes(id)} className="h-4 w-4 accent-primary" />
                    {ti(`${id}.name`)} <span className="text-xs text-muted-foreground">({t("setup.itemsCount", { count: INSTRUMENTS[id].items })})</span>
                  </label>
                ))}
              </div>
              {setup.riskProtocolAckAt ? null : (
                <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <input type="checkbox" name="riskAck" className="mt-0.5 h-4 w-4 accent-primary" />
                  <span>{t("setup.riskAck")}</span>
                </label>
              )}
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="instrumentEveryDays">{t("setup.every")}</Label>
                <Select id="instrumentEveryDays" name="instrumentEveryDays" defaultValue={String(setup.instrumentEveryDays)}>
                  {INSTRUMENT_INTERVALS.map((d) => (
                    <option key={d} value={d}>
                      {t("setup.everyDays", { days: d })}
                    </option>
                  ))}
                </Select>
              </div>
            </fieldset>
            <Button type="submit">{t("setup.save")}</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
