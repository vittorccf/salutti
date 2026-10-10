"use server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { cpfDigits, isValidCpf } from "@/lib/cpf";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import {
  clearThrottle,
  clientIp,
  createPortalSession,
  destroyPortalSession,
  getPortalSession,
  hashInviteToken,
  isThrottled,
  LIMITS,
  passwordProblem,
  registerFailure,
  THROTTLE_MINUTES,
  throttleKeys,
} from "@/lib/portal-auth";
import { MESSAGE_MAX } from "@/lib/portal";
import { moduleEnabled } from "@/lib/areas";
import {
  ACTIVITIES,
  type DiaryItem,
  diarySetup,
  EMOTION_KEYS,
  instrumentDue,
  INSTRUMENTS,
  isInstrument,
  MAX_EMOTIONS,
  parseAnswer,
  scoreInstrument,
  TEMPLATES,
} from "@/lib/diary";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
// Senha não leva trim: espaço no começo ou no fim faz parte dela.
const raw = (fd: FormData, key: string) => String(fd.get(key) ?? "");
// Hash fixo para gastar o mesmo tempo quando o CPF não existe (não revela quem tem acesso).
const DUMMY_HASH = bcrypt.hashSync("salutti-portal-dummy", 10);
const MESSAGES_PER_HOUR = 20;

async function err(key: string, values?: Record<string, string | number>): Promise<FormResult> {
  const t = await getTranslations("portal.errors");
  return { erro: t(key, values) };
}

async function requirePortalAction() {
  const access = await getPortalSession();
  if (!access) redirect("/portal/entrar");
  return access;
}

export async function loginAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const cpf = cpfDigits(str(fd, "cpf"));
  const password = raw(fd, "password");
  if (!isValidCpf(cpf) || !password) return err("loginInvalid");
  const ip = clientIp();
  const keys = { cpfIp: throttleKeys.cpfIp(cpf, ip), ip: throttleKeys.ip(ip) };
  // Mesma resposta exista o CPF ou não: o limite não revela quem é paciente.
  if ((await isThrottled(keys.cpfIp, LIMITS.cpfIp)) || (await isThrottled(keys.ip, LIMITS.ip))) return err("tooMany", { minutes: THROTTLE_MINUTES });

  const accesses = await db.patientPortalAccess.findMany({
    where: { cpfDigits: cpf, active: true, activatedAt: { not: null }, passwordHash: { not: null }, patient: { deletedAt: null } },
    include: { patient: { select: { workspaceId: true } } },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
    take: 5,
  });
  // Mesmo CPF em mais de um consultório: entra no primeiro cuja senha confere (o mais usado recentemente).
  let match: (typeof accesses)[number] | null = null;
  if (!accesses.length) await bcrypt.compare(password, DUMMY_HASH);
  for (const a of accesses) {
    if (await verifyPassword(password, a.passwordHash)) {
      match = a;
      break;
    }
  }
  if (!match) {
    await registerFailure(keys.cpfIp);
    await registerFailure(keys.ip);
    return err("loginInvalid");
  }
  await clearThrottle(keys.cpfIp);
  const ws = await db.workspace.findUnique({ where: { id: match.patient.workspaceId } });
  if (!ws || !moduleEnabled(ws, "portal")) return err("portalOff");
  await db.patientPortalAccess.update({ where: { id: match.id }, data: { lastLoginAt: new Date() } });
  await createPortalSession(match, match.patient.workspaceId);
  redirect("/portal");
}

// Convite: confirma a data de nascimento e/ou o CPF do cadastro e cria a senha. Uso único (consumido de forma atômica).
export async function redeemInviteAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const token = str(fd, "token");
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const access = await db.patientPortalAccess.findFirst({
    where: { inviteTokenHash: tokenHash, inviteExpiresAt: { gt: now }, active: true },
    include: { patient: true },
  });
  if (!access || access.patient.deletedAt) return err("inviteInvalid");
  const patient = access.patient;
  const ws = await db.workspace.findUnique({ where: { id: patient.workspaceId } });
  if (!ws || !moduleEnabled(ws, "portal")) return err("portalOff");
  // Cadastro sem data de nascimento nem CPF: o convite não vale (quem tivesse o link escolheria o login).
  if (!patient.birthDate && !cpfDigits(patient.cpf)) return err("inviteInvalid");
  const ip = clientIp();
  const keys = { access: throttleKeys.access(access.id), ip: throttleKeys.ip(ip) };
  if ((await isThrottled(keys.access, LIMITS.access)) || (await isThrottled(keys.ip, LIMITS.ip))) return err("tooMany", { minutes: THROTTLE_MINUTES });

  const fail = async (key: string) => {
    await registerFailure(keys.access);
    await registerFailure(keys.ip);
    return err(key);
  };
  if (patient.birthDate && str(fd, "birthDate") !== dateKeySP(patient.birthDate)) return fail("identityMismatch");
  const cpf = cpfDigits(str(fd, "cpf"));
  if (!isValidCpf(cpf)) return err("cpfInvalid");
  // CPF do cadastro confere; sem CPF no cadastro, o informado vira só o login (não entra no cadastro clínico).
  if (cpfDigits(patient.cpf) && cpfDigits(patient.cpf) !== cpf) return fail("identityMismatch");
  const password = raw(fd, "password");
  const problem = passwordProblem(password, raw(fd, "confirm"), [cpf, patient.birthDate ? dateKeySP(patient.birthDate).replace(/-/g, "") : ""]);
  if (problem) return err(`password.${problem}`);
  if (fd.get("accept") !== "on") return err("acceptRequired");

  const wasActive = !!access.activatedAt;
  const used = await db.patientPortalAccess.updateMany({
    where: { id: access.id, inviteTokenHash: tokenHash },
    data: {
      cpfDigits: cpf,
      passwordHash: await hashPassword(password),
      activatedAt: access.activatedAt ?? now,
      passwordChangedAt: now,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      lastLoginAt: now,
      sessionVersion: { increment: 1 },
    },
  });
  if (!used.count) return err("inviteInvalid");
  await clearThrottle(keys.access);
  await recordAudit({ workspaceId: patient.workspaceId, userId: null, action: wasActive ? "portal.password-reset" : "portal.activate", entity: "Patient", entityId: patient.id });
  const fresh = await db.patientPortalAccess.findUniqueOrThrow({ where: { id: access.id } });
  await createPortalSession(fresh, patient.workspaceId);
  redirect("/portal");
}

export async function logoutAction() {
  destroyPortalSession();
  redirect("/portal/entrar");
}

export async function changePasswordAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  const key = throttleKeys.access(access.id);
  if (await isThrottled(key, LIMITS.access)) return err("tooMany", { minutes: THROTTLE_MINUTES });
  if (!(await verifyPassword(raw(fd, "current"), access.passwordHash))) {
    await registerFailure(key);
    return err("currentPassword");
  }
  const birth = access.patient.birthDate ? dateKeySP(access.patient.birthDate).replace(/-/g, "") : "";
  const problem = passwordProblem(raw(fd, "password"), raw(fd, "confirm"), [access.cpfDigits ?? "", birth]);
  if (problem) return err(`password.${problem}`);
  // Sobe a versão: sessões em outros aparelhos caem; este recebe uma sessão nova.
  const updated = await db.patientPortalAccess.update({
    where: { id: access.id },
    data: { passwordHash: await hashPassword(raw(fd, "password")), passwordChangedAt: new Date(), sessionVersion: { increment: 1 } },
  });
  await clearThrottle(key);
  await createPortalSession(updated, access.patient.workspaceId);
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: "portal.password-change", entity: "Patient", entityId: access.patientId });
  const t = await getTranslations("portal.account");
  return { ok: t("passwordChanged") };
}

// Configuração do cartão do paciente logado (sem linha = modelo básico).
// Versão do texto de aceite (vai para a auditoria junto com a data).
const DIARY_CONSENT_VERSION = "2026-10";

async function diaryFor(access: { patientId: string }) {
  return diarySetup(await db.diaryConfig.findUnique({ where: { patientId: access.patientId } }));
}

// Aceite do cartão diário: finalidade, "não é lido em tempo real" e onde buscar ajuda. Sem ele, não há registro.
export async function diaryConsentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  if (!moduleEnabled(access.patient.workspace, "cartao_diario")) return err("generic");
  if (fd.get("accept") !== "on") return err("diaryConsentRequired");
  const now = new Date();
  const base = TEMPLATES.basico;
  await db.diaryConfig.upsert({
    where: { patientId: access.patientId },
    create: { patientId: access.patientId, workspaceId: access.patient.workspaceId, items: [...base.items], instruments: [], patientConsentAt: now },
    update: { patientConsentAt: now },
  });
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: "portal.diary-consent", entity: "Patient", entityId: access.patientId, metadata: { version: DIARY_CONSENT_VERSION } });
  revalidatePath("/portal");
  redirect("/portal");
}

// Parar de usar o cartão (consentimento revogável): os registros já feitos continuam com quem atende, como parte do
// prontuário; novos registros só com novo aceite.
export async function diaryRevokeAction(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  await db.diaryConfig.updateMany({ where: { patientId: access.patientId }, data: { patientConsentAt: null } });
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: "portal.diary-revoke", entity: "Patient", entityId: access.patientId });
  revalidatePath("/portal");
  redirect("/portal");
}

// Check-in do dia: humor obrigatório; os demais itens só se o profissional ligou para este paciente.
export async function checkinAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  if (!moduleEnabled(access.patient.workspace, "cartao_diario")) return err("generic");
  const setup = await diaryFor(access);
  if (!setup.patientConsentAt) return err("diaryConsentRequired");
  const on = (i: DiaryItem) => setup.items.includes(i);
  const mood = Number(str(fd, "mood"));
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) return err("moodRequired");
  const level = (key: string) => {
    const v = str(fd, key);
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
  };
  const anxiety = on("anxiety") ? level("anxiety") : null;
  const energy = on("energy") ? level("energy") : null;
  if (anxiety === undefined || energy === undefined) return err("generic");
  const sleepRaw = on("sleep") ? str(fd, "sleepHours").replace(",", ".") : "";
  const sleepHours = sleepRaw ? Number(sleepRaw) : null;
  if (sleepHours !== null && !(sleepHours >= 0 && sleepHours <= 24)) return err("sleepInvalid");
  const emotions = on("emotions") ? [...new Set(fd.getAll("emotions").map(String))].filter((e) => EMOTION_KEYS.includes(e)).slice(0, MAX_EMOTIONS) : [];
  const activities = on("activities") ? [...new Set(fd.getAll("activities").map(String))].filter((a) => (ACTIVITIES as readonly string[]).includes(a)) : [];
  const answers: Record<string, number | boolean | string> = {};
  for (const q of setup.questions) {
    const a = parseAnswer(q.type, str(fd, `q_${q.id}`));
    if (a !== null) answers[q.id] = a;
  }
  const notes = on("notes") ? str(fd, "notes").slice(0, 1000) || null : null;
  const med = str(fd, "medication");
  const medication = on("medication") ? (med === "sim" ? true : med === "nao" ? false : null) : null;
  const date = parseDateOnly(dateKeySP());
  // Só grava os itens ligados: se o profissional desligou um item no meio do dia, o que já foi registrado fica.
  const data = {
    mood,
    ...(on("anxiety") ? { anxiety } : {}),
    ...(on("energy") ? { energy } : {}),
    ...(on("sleep") ? { sleepHours } : {}),
    ...(on("medication") ? { medication } : {}),
    ...(on("emotions") ? { emotions } : {}),
    ...(on("activities") ? { activities } : {}),
    ...(on("notes") ? { notes } : {}),
    ...(setup.questions.length ? { answers: Object.keys(answers).length ? answers : Prisma.DbNull } : {}),
  };
  await db.dailyCard.upsert({
    where: { patientId_date: { patientId: access.patientId, date } },
    create: { patientId: access.patientId, workspaceId: access.patient.workspaceId, date, ...data },
    update: data,
  });
  revalidatePath("/portal");
  const t = await getTranslations("portal.week");
  // Humor baixo: além do "salvo", lembra que o registro não é lido na hora e onde buscar ajuda.
  return { ok: mood <= 2 ? `${t("checkinSaved")} ${t("checkinLow")}` : t("checkinSaved") };
}

// Questionário (PHQ-9, GAD-7, WHO-5) quando vence. PHQ-9 item 9 > 0: o paciente vai para a tela de apoio e o
// profissional recebe o destaque até marcar como visto (não é atendimento de emergência).
export async function instrumentAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  if (!moduleEnabled(access.patient.workspace, "cartao_diario")) return err("generic");
  const setup = await diaryFor(access);
  const id = str(fd, "instrument");
  if (!setup.patientConsentAt || !isInstrument(id) || !setup.instruments.includes(id)) return err("generic");
  const answers = Array.from({ length: INSTRUMENTS[id].items }, (_, i) => {
    const v = str(fd, `i${i + 1}`);
    return v === "" ? NaN : Number(v);
  });
  const result = scoreInstrument(id, answers);
  if (!result) return err("instrumentIncomplete");
  // Trava por paciente + questionário: dois cliques ou duas abas não criam duas respostas (nem dois alertas).
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`instrument:${access.patientId}:${id}`}))`;
    const last = await tx.instrumentResponse.findFirst({ where: { patientId: access.patientId, instrument: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!instrumentDue(last?.createdAt ?? null, setup.instrumentEveryDays)) return false;
    await tx.instrumentResponse.create({
      data: { workspaceId: access.patient.workspaceId, patientId: access.patientId, instrument: id, answers, score: result.score, band: result.band, riskFlag: result.risk },
    });
    return true;
  });
  if (!created) return err("instrumentNotDue");
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: "portal.instrument", entity: "Patient", entityId: access.patientId, metadata: { instrument: id } });
  revalidatePath("/portal");
  if (result.risk) redirect("/portal?apoio=1");
  const t = await getTranslations("diary.instrument");
  return { ok: t("saved") };
}

// Confirmar presença ou pedir remarcação de uma sessão futura (o consultório vê na agenda e no portal).
export async function respondSessionAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  const response = str(fd, "response");
  if (response !== "confirmed" && response !== "reschedule") return err("generic");
  const note = str(fd, "note").slice(0, 500) || null;
  const res = await db.appointment.updateMany({
    where: { id: str(fd, "appointmentId"), patientId: access.patientId, workspaceId: access.patient.workspaceId, startsAt: { gt: new Date() }, status: { not: "cancelled" } },
    data: { patientResponse: response, patientResponseAt: new Date(), patientResponseNote: response === "reschedule" ? note : null },
  });
  if (!res.count) return err("sessionUnavailable");
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: `portal.session-${response}`, entity: "Appointment", entityId: str(fd, "appointmentId") });
  revalidatePath("/portal");
  const t = await getTranslations("portal.week");
  return { ok: response === "confirmed" ? t("confirmedOk") : t("rescheduleOk") };
}

export async function toggleTaskAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  const done = fd.get("done") === "on";
  const res = await db.portalHighlight.updateMany({
    where: { id: str(fd, "highlightId"), patientId: access.patientId, workspaceId: access.patient.workspaceId, kind: "task", archivedAt: null },
    data: { doneAt: done ? new Date() : null, patientNote: str(fd, "patientNote").slice(0, 500) || null },
  });
  if (!res.count) return err("generic");
  revalidatePath("/portal");
  const t = await getTranslations("portal.week");
  return { ok: done ? t("taskDone") : t("taskSaved") };
}

export async function sendMessageAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  if (!access.messagesEnabled) return err("messagesOff");
  const body = str(fd, "body");
  if (!body) return err("messageEmpty");
  if (body.length > MESSAGE_MAX) return err("messageLong", { max: MESSAGE_MAX });
  // Até 20 mensagens por hora: a conversa é para recados, não para tempo real.
  const lastHour = await db.portalMessage.count({ where: { patientId: access.patientId, fromPatient: true, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (lastHour >= MESSAGES_PER_HOUR) return err("tooManyMessages");
  await db.portalMessage.create({ data: { workspaceId: access.patient.workspaceId, patientId: access.patientId, fromPatient: true, body } });
  revalidatePath("/portal/mensagens");
  const t = await getTranslations("portal.messages");
  return { ok: t("sent") };
}
