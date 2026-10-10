// Lista de espera: regras puras (sem banco). Referências: SimplePractice e Cliniko (preferências e desfechos),
// Jane (oferecer vaga a quem combina). Ética: inscrição não garante atendimento; quem está em crise não espera
// (CVV 188, SAMU 192); dados mínimos antes do vínculo (LGPD).

export const WAITLIST_STATUSES = ["aguardando", "contatado", "agendado", "desistiu", "sem_retorno", "encaminhado", "expirado"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];
export const OPEN_STATUSES: WaitlistStatus[] = ["aguardando", "contatado"];
export const CLOSED_STATUSES: WaitlistStatus[] = ["desistiu", "sem_retorno", "encaminhado", "expirado"];

export const MODALITIES = ["indiferente", "online", "presencial"] as const;
export const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab"] as const;
export const SHIFTS = ["manha", "tarde", "noite"] as const;
export const SOURCES = ["instagram", "indicacao", "google", "site", "outro"] as const;

// Quem saiu da lista é anonimizado depois deste prazo (LGPD: sem motivo para guardar).
export const RETENTION_MONTHS = 6;
export const REASON_MAX = 280;

const DAY = 86_400_000;

// Métricas da lista: quantos aguardam, espera média e mediana (entrada até agendar) e taxa de conversão.
export function waitlistMetrics(entries: { status: string; createdAt: Date; statusChangedAt: Date }[]) {
  const waiting = entries.filter((e) => (OPEN_STATUSES as string[]).includes(e.status)).length;
  const scheduled = entries.filter((e) => e.status === "agendado");
  const finished = entries.filter((e) => e.status === "agendado" || (CLOSED_STATUSES as string[]).includes(e.status));
  const waits = scheduled.map((e) => Math.max(0, Math.round((e.statusChangedAt.getTime() - e.createdAt.getTime()) / DAY))).sort((a, b) => a - b);
  const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const median = waits.length ? (waits.length % 2 ? waits[(waits.length - 1) / 2] : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2)) : null;
  const conversion = finished.length ? Math.round((scheduled.length / finished.length) * 100) : null;
  return { waiting, scheduled: scheduled.length, avgDays: avg, medianDays: median, conversion };
}

// Combina com uma vaga? (dia da semana, turno e modalidade; listas vazias = "qualquer").
export function matchesSlot(entry: { preferredDays: string[]; preferredShifts: string[]; modality: string }, slot: { day: string; shift: string; modality: string }) {
  if (entry.preferredDays.length && !entry.preferredDays.includes(slot.day)) return false;
  if (entry.preferredShifts.length && !entry.preferredShifts.includes(slot.shift)) return false;
  return entry.modality === "indiferente" || slot.modality === "indiferente" || entry.modality === slot.modality;
}

// Endereço público da lista: minúsculas, números e hífen (3 a 40).
export const isValidSlug = (v: string) => /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(v);
export const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Data limite para anonimizar quem saiu da lista.
export const retentionCutoff = (now = new Date()) => new Date(now.getFullYear(), now.getMonth() - RETENTION_MONTHS, now.getDate());

// Teto de inscrições pelo formulário público por consultório em 24 h (trocar de IP não lota a lista).
export const PUBLIC_DAILY_CAP = 50;
// A partir desta espera, a tela sugere oferecer alternativas (UBS/CAPS, clínica-escola, CVV).
export const REFERRAL_AFTER_DAYS = 30;

// Divulgação pública do psicólogo pede nome, profissão e registro (Código de Ética, art. 20).
// Sem registro, só quem declarou não ter conselho (psicanalista, terapeuta).
export const canAdvertise = (p: { councilNumber: string | null; noCouncil: boolean }) => p.noCouncil || !!p.councilNumber?.trim();
