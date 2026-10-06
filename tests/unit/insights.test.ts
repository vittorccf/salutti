// Motor de insights da LUMA com o banco simulado: regras e textos (voz do design system).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  charge: { aggregate: vi.fn(), findMany: vi.fn() },
  appointment: { count: vi.fn() },
  professional: { count: vi.fn() },
  patient: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { insightsEngine } from "@/lib/providers/insights";

const nbsp = (s: string) => s.replace(/ /g, " ");

beforeEach(() => {
  vi.resetAllMocks();
  db.charge.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.charge.findMany.mockResolvedValue([]);
  db.appointment.count.mockResolvedValue(0);
  db.professional.count.mockResolvedValue(0);
  db.patient.findMany.mockResolvedValue([]);
});

describe("insights da LUMA", () => {
  it("sem dados, nenhum insight", async () => {
    expect(await insightsEngine.computeAll({ workspaceId: "w" })).toEqual([]);
  });

  it("queda de receita acima de 10% vira alerta com valores BR", async () => {
    db.charge.aggregate.mockResolvedValueOnce({ _sum: { amount: 360 } }).mockResolvedValueOnce({ _sum: { amount: 1170 } });
    const [i] = await insightsEngine.computeAll({ workspaceId: "w" });
    expect(i.kind).toBe("revenue_drop");
    expect(i.severity).toBe("warn");
    expect(i.title).toBe("Receita caiu 69,2% em relação ao mês anterior");
    expect(nbsp(i.body)).toContain("R$ 360,00");
    expect(nbsp(i.body)).toContain("R$ 1.170,00");
  });

  it("cobranças em atraso: plural, total e crítico acima de 5", async () => {
    db.charge.findMany.mockResolvedValue(Array.from({ length: 6 }, () => ({ amount: 150 })));
    const i = (await insightsEngine.computeAll({ workspaceId: "w" })).find((x) => x.kind === "overdue_pattern")!;
    expect(i.severity).toBe("critical");
    expect(nbsp(i.title)).toBe("6 cobranças em atraso · R$ 900,00");
  });

  it("agenda com ocupação baixa", async () => {
    db.professional.count.mockResolvedValue(1);
    db.appointment.count.mockResolvedValue(1);
    const i = (await insightsEngine.computeAll({ workspaceId: "w" })).find((x) => x.kind === "scheduling_gap")!;
    expect(i.body).toMatch(/^1 sessão agendada para os próximos 7 dias, abaixo do mínimo de 6\./);
  });

  it("textos sem '(s)' nem valores com ponto decimal", async () => {
    db.charge.aggregate.mockResolvedValueOnce({ _sum: { amount: 2000 } }).mockResolvedValueOnce({ _sum: { amount: 1000 } });
    db.charge.findMany.mockResolvedValue([{ amount: 99.5 }]);
    const all = await insightsEngine.computeAll({ workspaceId: "w" });
    for (const i of all) {
      expect(i.title + i.body).not.toMatch(/\(s\)|\d\.\d{2}\b/);
    }
  });
});
