"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  DIARY_ITEMS,
  type DiaryItem,
  diarySetup,
  INSTRUMENT_INTERVALS,
  isInstrument,
  MAX_QUESTIONS,
  mergeQuestions,
  QUESTION_LABEL_MAX,
  QUESTION_TYPES,
  type QuestionType,
  TEMPLATES,
} from "@/lib/diary";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { requireDiaryPatient } from "./_lib";

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const page = (patientId: string) => `/app/pacientes/${patientId}/cartao`;

// Aplica um modelo pronto (itens e questionários) mantendo as perguntas próprias e o aceite do paciente.
// O PHQ-9 só entra depois que o profissional confirma ter protocolo de risco (o Salutti não monitora em tempo real).
export async function applyTemplateAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await requireDiaryPatient(str(fd, "patientId"));
  const template = str(fd, "template");
  const preset = Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template] : null;
  if (!preset) {
    const t = await getTranslations("diary.pro");
    return { erro: t("errors.generic") };
  }
  const current = await db.diaryConfig.findUnique({ where: { patientId: patient.id }, select: { riskProtocolAckAt: true } });
  const needsAck = preset.instruments.includes("phq9") && !current?.riskProtocolAckAt;
  const instruments = needsAck ? preset.instruments.filter((i) => i !== "phq9") : [...preset.instruments];
  await db.diaryConfig.upsert({
    where: { patientId: patient.id },
    create: { patientId: patient.id, workspaceId: ctx.workspace.id, template, items: [...preset.items], instruments },
    update: { template, items: [...preset.items], instruments },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "diary.template", entity: "Patient", entityId: patient.id, metadata: { template } });
  revalidatePath(page(patient.id));
  // Redireciona com um marcador: a página recria o formulário de itens com os valores do modelo.
  const periodo = str(fd, "periodo") === "90" ? "&periodo=90" : "";
  redirect(`${page(patient.id)}?modelo=${template}&v=${Date.now()}${periodo}${needsAck ? "&protocolo=1" : ""}`);
}

// Itens, perguntas próprias (até 5) e questionários com a frequência. Menos itens = mais adesão: tudo opcional menos o humor.
export async function saveSetupAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await requireDiaryPatient(str(fd, "patientId"));
  const t = await getTranslations("diary.pro");
  const items = [...new Set(fd.getAll("items").map(String))].filter((i): i is DiaryItem => (DIARY_ITEMS as readonly string[]).includes(i));
  const instruments = [...new Set(fd.getAll("instruments").map(String))].filter(isInstrument);
  const every = Number(str(fd, "instrumentEveryDays"));
  const instrumentEveryDays = (INSTRUMENT_INTERVALS as readonly number[]).includes(every) ? every : 14;
  const row = await db.diaryConfig.findUnique({ where: { patientId: patient.id } });
  const current = diarySetup(row);
  const acked = !!current.riskProtocolAckAt || fd.get("riskAck") === "on";
  if (instruments.includes("phq9") && !acked) return { erro: t("errors.riskAckRequired") };
  const submitted: { prevId: string; label: string; type: QuestionType }[] = [];
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const label = str(fd, `qLabel${i}`, QUESTION_LABEL_MAX);
    if (!label) continue;
    const type = str(fd, `qType${i}`);
    if (!(QUESTION_TYPES as readonly string[]).includes(type)) return { erro: t("errors.generic") };
    submitted.push({ prevId: str(fd, `qId${i}`), label, type: type as QuestionType });
  }
  const questions = mergeQuestions(current.allQuestions, submitted, () => crypto.randomBytes(4).toString("hex"));
  const riskProtocolAckAt = current.riskProtocolAckAt ?? (acked ? new Date() : null);
  const data = { template: "personalizado", items, questions, instruments, instrumentEveryDays, riskProtocolAckAt };
  await db.diaryConfig.upsert({
    where: { patientId: patient.id },
    create: { patientId: patient.id, workspaceId: ctx.workspace.id, ...data },
    update: data,
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "diary.setup",
    entity: "Patient",
    entityId: patient.id,
    metadata: { items, instruments, questions: submitted.length, riskProtocolAck: !current.riskProtocolAckAt && acked },
  });
  revalidatePath(page(patient.id));
  return { ok: t("setupSaved") };
}

// Registrar conduta: o alerta de risco sai da faixa do topo; a nota fica com a resposta (registro documental).
export async function reviewRiskAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx, patient } = await requireDiaryPatient(str(fd, "patientId"));
  const note = str(fd, "note", 1000) || null;
  const res = await db.instrumentResponse.updateMany({
    where: { id: str(fd, "responseId"), patientId: patient.id, workspaceId: ctx.workspace.id, riskFlag: true, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedById: ctx.user.id, reviewNote: note },
  });
  const t = await getTranslations("diary.pro");
  if (!res.count) return { erro: t("errors.generic") };
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "diary.risk-conduct", entity: "InstrumentResponse", entityId: str(fd, "responseId") });
  revalidatePath(page(patient.id));
  return { ok: t("riskReviewed") };
}
