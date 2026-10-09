"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { cpfDigits, formatCpf, isValidCpf } from "@/lib/cpf";
import { dateKeySP, parseDateOnly } from "@/lib/dates";
import {
  createPortalSession,
  destroyPortalSession,
  getPortalSession,
  hashInviteToken,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  passwordProblem,
} from "@/lib/portal-auth";
import { MESSAGE_MAX } from "@/lib/portal";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
// Senha não leva trim: espaço no começo ou no fim faz parte dela.
const raw = (fd: FormData, key: string) => String(fd.get(key) ?? "");
// Hash fixo para gastar o mesmo tempo quando o CPF não existe (não revela quem tem acesso).
const DUMMY_HASH = bcrypt.hashSync("salutti-portal-dummy", 10);

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
  const accesses = await db.patientPortalAccess.findMany({
    where: { cpfDigits: cpf, active: true, activatedAt: { not: null }, patient: { deletedAt: null } },
    include: { patient: { select: { workspaceId: true } } },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
  });
  const now = new Date();
  if (!accesses.length) {
    await bcrypt.compare(password, DUMMY_HASH);
    return err("loginInvalid");
  }
  if (accesses.every((a) => a.lockedUntil && a.lockedUntil > now)) return err("locked", { minutes: LOCK_MINUTES });
  // Mesmo CPF em mais de um consultório: entra no primeiro cuja senha confere (o mais usado recentemente).
  for (const a of accesses) {
    if (a.lockedUntil && a.lockedUntil > now) continue;
    if (await verifyPassword(password, a.passwordHash)) {
      await db.patientPortalAccess.update({ where: { id: a.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now } });
      await createPortalSession(a, a.patient.workspaceId);
      redirect("/portal");
    }
  }
  // Senha errada: conta para todos os acessos do CPF; na 5ª seguida, trava por 15 minutos.
  for (const a of accesses) {
    const failed = a.failedAttempts + 1;
    await db.patientPortalAccess.update({
      where: { id: a.id },
      data: failed >= MAX_FAILED_ATTEMPTS ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedAttempts: failed },
    });
  }
  return err("loginInvalid");
}

// Convite (ou link antigo, antes da senha): confirma a data de nascimento, o CPF e cria a senha.
export async function redeemInviteAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const token = str(fd, "token");
  const now = new Date();
  const access =
    (await db.patientPortalAccess.findFirst({
      where: { inviteTokenHash: hashInviteToken(token), inviteExpiresAt: { gt: now }, active: true },
      include: { patient: true },
    })) ??
    (await db.patientPortalAccess.findFirst({ where: { token, activatedAt: null, active: true }, include: { patient: true } }));
  if (!access || access.patient.deletedAt) return err("inviteInvalid");
  if (access.lockedUntil && access.lockedUntil > now) return err("locked", { minutes: LOCK_MINUTES });

  const patient = access.patient;
  const fail = async (key: string) => {
    const failed = access.failedAttempts + 1;
    await db.patientPortalAccess.update({
      where: { id: access.id },
      data: failed >= MAX_FAILED_ATTEMPTS ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedAttempts: failed },
    });
    return err(key);
  };
  // Data de nascimento do cadastro: confere (segunda checagem além do link).
  if (patient.birthDate && str(fd, "birthDate") !== dateKeySP(patient.birthDate)) return fail("birthDateMismatch");
  const cpf = cpfDigits(str(fd, "cpf"));
  if (!isValidCpf(cpf)) return err("cpfInvalid");
  if (patient.cpf && cpfDigits(patient.cpf) && cpfDigits(patient.cpf) !== cpf) return fail("cpfMismatch");
  const password = raw(fd, "password");
  const problem = passwordProblem(password, raw(fd, "confirm"), [cpf, patient.birthDate ? dateKeySP(patient.birthDate).replace(/-/g, "") : ""]);
  if (problem) return err(`password.${problem}`);
  if (fd.get("accept") !== "on") return err("acceptRequired");

  const wasActive = !!access.activatedAt;
  await db.$transaction([
    db.patientPortalAccess.update({
      where: { id: access.id },
      data: {
        cpfDigits: cpf,
        passwordHash: await hashPassword(password),
        activatedAt: access.activatedAt ?? now,
        passwordChangedAt: now,
        inviteTokenHash: null,
        inviteExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    // CPF informado pelo próprio paciente entra no cadastro quando ainda não havia.
    ...(patient.cpf ? [] : [db.patient.update({ where: { id: patient.id }, data: { cpf: formatCpf(cpf) } })]),
  ]);
  await recordAudit({
    workspaceId: patient.workspaceId,
    userId: null,
    action: wasActive ? "portal.password-reset" : "portal.activate",
    entity: "Patient",
    entityId: patient.id,
  });
  await createPortalSession(access, patient.workspaceId);
  redirect("/portal");
}

export async function logoutAction() {
  destroyPortalSession();
  redirect("/portal/entrar");
}

export async function changePasswordAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  if (!(await verifyPassword(raw(fd, "current"), access.passwordHash))) return err("currentPassword");
  const birth = access.patient.birthDate ? dateKeySP(access.patient.birthDate).replace(/-/g, "") : "";
  const problem = passwordProblem(raw(fd, "password"), raw(fd, "confirm"), [access.cpfDigits ?? "", birth]);
  if (problem) return err(`password.${problem}`);
  await db.patientPortalAccess.update({
    where: { id: access.id },
    data: { passwordHash: await hashPassword(raw(fd, "password")), passwordChangedAt: new Date() },
  });
  // A sessão atual também cai com a troca: entra de novo com a senha nova.
  await createPortalSession(access, access.patient.workspaceId);
  await recordAudit({ workspaceId: access.patient.workspaceId, userId: null, action: "portal.password-change", entity: "Patient", entityId: access.patientId });
  const t = await getTranslations("portal.account");
  return { ok: t("passwordChanged") };
}

// Check-in do dia (humor obrigatório; ansiedade, sono e nota opcionais).
export async function checkinAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const access = await requirePortalAction();
  const mood = Number(str(fd, "mood"));
  if (!Number.isInteger(mood) || mood < 1 || mood > 5) return err("moodRequired");
  const anxietyRaw = str(fd, "anxiety");
  const anxiety = anxietyRaw ? Number(anxietyRaw) : null;
  if (anxiety !== null && !(Number.isInteger(anxiety) && anxiety >= 1 && anxiety <= 5)) return err("generic");
  const sleepRaw = str(fd, "sleepHours").replace(",", ".");
  const sleepHours = sleepRaw ? Number(sleepRaw) : null;
  if (sleepHours !== null && !(sleepHours >= 0 && sleepHours <= 24)) return err("sleepInvalid");
  const notes = str(fd, "notes").slice(0, 1000) || null;
  const date = parseDateOnly(dateKeySP());
  await db.dailyCard.upsert({
    where: { patientId_date: { patientId: access.patientId, date } },
    create: { patientId: access.patientId, workspaceId: access.patient.workspaceId, date, mood, anxiety, sleepHours, notes },
    update: { mood, anxiety, sleepHours, notes },
  });
  revalidatePath("/portal");
  const t = await getTranslations("portal.week");
  return { ok: t("checkinSaved") };
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
  await db.portalMessage.create({ data: { workspaceId: access.patient.workspaceId, patientId: access.patientId, fromPatient: true, body } });
  revalidatePath("/portal/mensagens");
  const t = await getTranslations("portal.messages");
  return { ok: t("sent") };
}
