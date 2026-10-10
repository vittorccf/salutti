import { describe, expect, it } from "vitest";
import { isValidSlug, matchesSlot, retentionCutoff, slugify, waitlistMetrics } from "@/lib/waitlist";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("waitlistMetrics", () => {
  it("conta quem aguarda, espera média e mediana até agendar e conversão sobre quem saiu", () => {
    const m = waitlistMetrics([
      { status: "aguardando", createdAt: day(0), statusChangedAt: day(0) },
      { status: "contatado", createdAt: day(0), statusChangedAt: day(3) },
      { status: "agendado", createdAt: day(0), statusChangedAt: day(10) },
      { status: "agendado", createdAt: day(0), statusChangedAt: day(20) },
      { status: "agendado", createdAt: day(0), statusChangedAt: day(60) },
      { status: "desistiu", createdAt: day(0), statusChangedAt: day(5) },
    ]);
    expect(m).toEqual({ waiting: 2, scheduled: 3, avgDays: 30, medianDays: 20, conversion: 75 });
  });

  it("sem histórico, as métricas ficam vazias em vez de zero", () => {
    expect(waitlistMetrics([])).toEqual({ waiting: 0, scheduled: 0, avgDays: null, medianDays: null, conversion: null });
  });

  it("mediana com número par de esperas", () => {
    const m = waitlistMetrics([
      { status: "agendado", createdAt: day(0), statusChangedAt: day(10) },
      { status: "agendado", createdAt: day(0), statusChangedAt: day(21) },
    ]);
    expect(m.medianDays).toBe(16);
  });
});

describe("matchesSlot", () => {
  const entry = { preferredDays: ["seg", "qua"], preferredShifts: ["noite"], modality: "online" };
  it("combina dia, turno e modalidade", () => {
    expect(matchesSlot(entry, { day: "qua", shift: "noite", modality: "online" })).toBe(true);
    expect(matchesSlot(entry, { day: "ter", shift: "noite", modality: "online" })).toBe(false);
    expect(matchesSlot(entry, { day: "seg", shift: "manha", modality: "online" })).toBe(false);
    expect(matchesSlot(entry, { day: "seg", shift: "noite", modality: "presencial" })).toBe(false);
  });
  it("preferência vazia ou 'tanto faz' aceita qualquer vaga", () => {
    const any = { preferredDays: [], preferredShifts: [], modality: "indiferente" };
    expect(matchesSlot(any, { day: "sab", shift: "manha", modality: "presencial" })).toBe(true);
    expect(matchesSlot(entry, { day: "seg", shift: "noite", modality: "indiferente" })).toBe(true);
  });
});

describe("endereço público", () => {
  it("aceita minúsculas, números e hífen entre 3 e 40", () => {
    expect(isValidSlug("dra-ana-silva")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("-ana")).toBe(false);
    expect(isValidSlug("Ana")).toBe(false);
    expect(isValidSlug("a".repeat(41))).toBe(false);
  });
  it("slugify tira acento e símbolos", () => {
    expect(slugify("Consultório Dra. Ângela  ")).toBe("consultorio-dra-angela");
  });
});

it("retenção: 6 meses antes", () => {
  expect(retentionCutoff(new Date(2026, 9, 9))).toEqual(new Date(2026, 3, 9));
});
