// Lembrete de aniversários no painel: pacientes, profissionais da equipe e o próprio usuário.
// Tudo no dia de São Paulo; quem nasceu em 29/02 é lembrado em 28/02 nos anos que não são bissextos.
import { dateKeySP } from "./dates";

export type BirthdayKind = "self" | "professional" | "patient";
export type BirthdayPerson = { kind: BirthdayKind; id: string; name: string; birthDate: Date };
export type Birthday = BirthdayPerson & { daysUntil: number; turning: number; dayMonth: string };

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

export function upcomingBirthdays(people: BirthdayPerson[], now = new Date(), days = 7): Birthday[] {
  const [ty, tm, td] = dateKeySP(now).split("-").map(Number);
  const today = utcDay(ty, tm, td);
  const out: Birthday[] = [];
  for (const p of people) {
    const [by, bm, bd] = dateKeySP(p.birthDate).split("-").map(Number);
    const next = (y: number) => utcDay(y, bm, bm === 2 && bd === 29 && !isLeap(y) ? 28 : bd);
    let year = ty;
    if (next(year) < today) year += 1;
    const daysUntil = Math.round((next(year) - today) / 86_400_000);
    if (daysUntil > days) continue;
    out.push({ ...p, daysUntil, turning: year - by, dayMonth: `${String(bd).padStart(2, "0")}/${String(bm).padStart(2, "0")}` });
  }
  // Hoje primeiro; no mesmo dia, o próprio usuário, depois equipe, depois pacientes.
  const order: Record<BirthdayKind, number> = { self: 0, professional: 1, patient: 2 };
  return out.sort((a, b) => a.daysUntil - b.daysUntil || order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "pt-BR"));
}
