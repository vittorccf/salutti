// Os resultados não podem depender do fuso do servidor: rode também com TZ=UTC (como na Vercel).
import { describe, expect, it } from "vitest";
import {
  dateKeySP,
  daysBetweenSP,
  isPastDue,
  isSameDaySP,
  parseDateOnly,
  parseDateTimeLocal,
  startOfMonthSP,
  startOfTodaySP,
  startOfWeekSP,
  toDateTimeLocalSP,
} from "@/lib/dates";
import { formatDateBR, formatDateTimeBR, formatTimeBR, greetingBR } from "@/lib/utils";

describe("datas em São Paulo", () => {
  it("campo só de data é 00:00 em São Paulo e exibe o mesmo dia", () => {
    const due = parseDateOnly("2026-10-06");
    expect(due.toISOString()).toBe("2026-10-06T03:00:00.000Z");
    expect(formatDateBR(due)).toBe("06/10/2026");
    expect(dateKeySP(due)).toBe("2026-10-06");
  });

  it("data e hora do formulário são lidas em São Paulo", () => {
    const s = parseDateTimeLocal("2026-10-06T14:00");
    expect(s.toISOString()).toBe("2026-10-06T17:00:00.000Z");
    expect(formatTimeBR(s)).toBe("14:00");
    expect(formatDateTimeBR(s)).toBe("06/10/2026, 14:00");
    expect(toDateTimeLocalSP(s)).toBe("2026-10-06T14:00");
  });

  it("cobrança só vence a partir do dia seguinte", () => {
    const due = parseDateOnly("2026-10-06");
    expect(isPastDue(due, parseDateTimeLocal("2026-10-06T23:59"))).toBe(false);
    expect(isPastDue(due, parseDateTimeLocal("2026-10-07T00:01"))).toBe(true);
  });

  it("início do dia, do mês e da semana em São Paulo", () => {
    const now = parseDateTimeLocal("2026-10-06T21:30"); // já é dia 07 em UTC
    expect(startOfTodaySP(now).toISOString()).toBe("2026-10-06T03:00:00.000Z");
    expect(startOfMonthSP(now).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(startOfMonthSP(now, -1).toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(startOfWeekSP(parseDateTimeLocal("2026-10-11T23:00")).toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });

  it("dias de calendário e mesmo dia", () => {
    expect(daysBetweenSP(parseDateOnly("2026-10-06"), parseDateTimeLocal("2026-10-09T08:00"))).toBe(3);
    expect(isSameDaySP(parseDateTimeLocal("2026-10-06T00:00"), parseDateTimeLocal("2026-10-06T23:59"))).toBe(true);
  });

  it("saudação pela hora de São Paulo", () => {
    expect(greetingBR(parseDateTimeLocal("2026-10-06T08:00"))).toBe("Bom dia");
    expect(greetingBR(parseDateTimeLocal("2026-10-06T14:00"))).toBe("Boa tarde");
    expect(greetingBR(parseDateTimeLocal("2026-10-06T21:30"))).toBe("Boa noite");
  });
});
