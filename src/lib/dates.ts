// Fuso único do app. O servidor (Vercel) roda em UTC e o navegador no fuso de quem acessa;
// gravar, exibir e comparar datas sempre em São Paulo evita horário 3h adiantado e dia trocado.
//
// Convenções:
// - Campo só de data (vencimento, nascimento, cartão diário): gravado como 00:00 em São Paulo.
// - Data e hora digitadas em <input type="datetime-local">: interpretadas em São Paulo.
// - "Hoje", semana e mês: calculados em São Paulo.
// As funções devolvem Date comum (instante), que é o que o Prisma grava.
import { TZDate } from "@date-fns/tz";
import { addMonths, startOfDay, startOfMonth, startOfWeek } from "date-fns";

export const TZ = "America/Sao_Paulo";

const instant = (d: Date) => new Date(d.getTime());

// Date "visto" em São Paulo: getHours/getDate e as funções do date-fns passam a operar no fuso.
export const inSP = (date: Date | string | number = new Date()) => new TZDate(new Date(date).getTime(), TZ);

// "2026-10-06" → 06/10/2026 00:00 em São Paulo.
export const parseDateOnly = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return instant(new TZDate(y, m - 1, d, 0, 0, 0, TZ));
};

// "2026-10-06T14:00" → 06/10/2026 14:00 em São Paulo.
export const parseDateTimeLocal = (value: string) => {
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return instant(new TZDate(y, m - 1, d, h, mi, 0, TZ));
};

const pad = (n: number) => String(n).padStart(2, "0");

// Chave "AAAA-MM-DD" do dia em São Paulo; também serve de defaultValue de <input type="date">.
export const dateKeySP = (date: Date | string = new Date()) => {
  const d = inSP(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// defaultValue de <input type="datetime-local"> no horário de São Paulo.
export const toDateTimeLocalSP = (date: Date) => {
  const d = inSP(date);
  return `${dateKeySP(date)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const startOfTodaySP = (now = new Date()) => instant(startOfDay(inSP(now)));

export const startOfMonthSP = (now = new Date(), offsetMonths = 0) =>
  instant(startOfMonth(addMonths(inSP(now), offsetMonths)));

export const startOfWeekSP = (date = new Date()) => instant(startOfWeek(inSP(date), { weekStartsOn: 1 }));

export const isSameDaySP = (a: Date, b: Date) => dateKeySP(a) === dateKeySP(b);

// Vencido só a partir do dia seguinte ao vencimento (no calendário de São Paulo).
export const isPastDue = (dueDate: Date, now = new Date()) => dateKeySP(dueDate) < dateKeySP(now);

// Dias de calendário entre duas datas em São Paulo (ex.: dias de atraso).
export const daysBetweenSP = (from: Date, to: Date) =>
  Math.round((parseDateOnly(dateKeySP(to)).getTime() - parseDateOnly(dateKeySP(from)).getTime()) / 86_400_000);
