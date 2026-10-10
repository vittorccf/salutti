// Regras do portal do paciente compartilhadas entre o portal e o app do profissional (só no servidor).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const HIGHLIGHT_KINDS = ["task", "note", "material"] as const;
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];
export const MESSAGE_MAX = 2000;
// O botão "Entrar na sessão" aparece de 15 minutos antes até o fim da sessão.
export const JOIN_WINDOW_MINUTES = 15;

type ScopeCtx = { role: string; user: { email: string }; workspace: { accountType: string } };

// Sigilo dentro da clínica: o profissional (papel "professional") vê o portal só dos pacientes que atende
// (sessão com o cadastro profissional do mesmo e-mail). Dono e administrador veem todos; autônomo é um só.
export const portalPatientScope = (ctx: ScopeCtx): Prisma.PatientWhereInput =>
  ctx.role === "professional" && ctx.workspace.accountType === "clinica"
    ? { appointments: { some: { professional: { email: { equals: ctx.user.email, mode: "insensitive" } } } } }
    : {};

// Pendências do portal para o badge do menu: mensagens do paciente não lidas e pedidos de remarcação de sessões futuras.
// (Alertas de risco do cartão diário têm faixa própria no topo do app: src/lib/diary-alerts.ts.)
export async function portalPendingCount(ctx: ScopeCtx & { workspace: { id: string } }) {
  const workspaceId = ctx.workspace.id;
  const patient = portalPatientScope(ctx);
  const [unread, reschedule] = await Promise.all([
    db.portalMessage.count({ where: { workspaceId, fromPatient: true, readAt: null, patient } }),
    db.appointment.count({ where: { workspaceId, patientResponse: "reschedule", startsAt: { gte: new Date() }, status: { not: "cancelled" }, patient } }),
  ]);
  return unread + reschedule;
}

export const canJoin = (startsAt: Date, endsAt: Date, now = new Date()) =>
  now.getTime() >= startsAt.getTime() - JOIN_WINDOW_MINUTES * 60_000 && now.getTime() <= endsAt.getTime();

// Link externo de material: só http(s), para não aceitar javascript: ou data:.
export function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Arquivo .ics de uma sessão (adicionar à agenda do celular). Sem dados clínicos: só "Sessão" e o consultório.
export function sessionIcs(opts: { id: string; startsAt: Date; endsAt: Date; title: string; location?: string | null; url?: string | null }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Salutti//Portal//PT-BR",
    "BEGIN:VEVENT",
    `UID:${opts.id}@salutti`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.startsAt)}`,
    `DTEND:${stamp(opts.endsAt)}`,
    `SUMMARY:${esc(opts.title)}`,
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    ...(opts.url ? [`URL:${esc(opts.url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
