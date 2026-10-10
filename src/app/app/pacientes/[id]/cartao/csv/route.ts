import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { dateKeySP } from "@/lib/dates";
import { csvCell, diarySetup } from "@/lib/diary";
import { getTranslations } from "@/i18n/server";
import { requireDiaryPatient } from "../_lib";

export const dynamic = "force-dynamic";

// Cartão diário em CSV (";" e BOM para abrir certo no Excel): um dia por linha, perguntas próprias em colunas
// (as arquivadas também, marcadas), textos no idioma de quem exporta.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { ctx, patient } = await requireDiaryPatient(params.id);
  const [config, cards, t, tc] = await Promise.all([
    db.diaryConfig.findUnique({ where: { patientId: patient.id } }),
    db.dailyCard.findMany({ where: { patientId: patient.id, workspaceId: ctx.workspace.id }, orderBy: { date: "asc" } }),
    getTranslations("diary.pro.csv"),
    getTranslations("diary.client"),
  ]);
  const questions = diarySetup(config).allQuestions;
  const yesNo = (v: unknown) => (v === true ? tc("yes") : v === false ? tc("no") : v);
  const header = [
    t("date"),
    t("mood"),
    t("anxiety"),
    t("energy"),
    t("sleep"),
    t("medication"),
    t("emotions"),
    t("activities"),
    ...questions.map((q) => (q.archived ? t("archived", { label: q.label }) : q.label)),
    t("note"),
  ];
  const rows = cards.map((c) => {
    const a = (c.answers ?? {}) as Record<string, unknown>;
    return [
      dateKeySP(c.date),
      c.mood,
      c.anxiety,
      c.energy,
      c.sleepHours,
      yesNo(c.medication),
      c.emotions.map((e) => tc(`emotion.${e}`)).join(", "),
      c.activities.map((x) => tc(`activity.${x}`)).join(", "),
      ...questions.map((q) => yesNo(a[q.id])),
      c.notes,
    ];
  });
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "diary.export", entity: "Patient", entityId: patient.id });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartao-diario-${dateKeySP(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
