import { describe, expect, it } from "vitest";
import {
  bottleneck,
  capacityLimits,
  DEFAULT_CAPACITY_INPUT,
  formatBytes,
  formatUsers,
  pagesPerUserMonth,
  projectToPeriodEnd,
  usageLevel,
} from "@/lib/backoffice/capacity";

describe("gestão de recursos: capacidade", () => {
  it("telas por pessoa no mês: 1 tela a cada 30 s, 10 h/dia, 22 dias", () => {
    expect(pagesPerUserMonth(DEFAULT_CAPACITY_INPUT)).toBe(120 * 10 * 22);
  });

  it("com os valores padrão, o gargalo é uma cota mensal, não a simultaneidade", () => {
    const limits = capacityLimits(DEFAULT_CAPACITY_INPUT);
    const worst = bottleneck(limits);
    expect(worst.key).not.toBe("concurrency");
    // 10 GB de origem ÷ 40 KB por tela ÷ 26.400 telas por pessoa ≈ 9,9 pessoas.
    expect(worst.key).toBe("origin");
    expect(Math.floor(worst.maxConcurrentUsers)).toBe(9);
    expect(limits.find((l) => l.key === "concurrency")!.maxConcurrentUsers).toBeGreaterThan(100_000);
  });

  it("compute da Neon estoura quando o banco fica acordado mais de 400 h a 0,25 CU", () => {
    const ok = capacityLimits({ ...DEFAULT_CAPACITY_INPUT, hoursPerDay: 13, daysPerMonth: 30 }); // 390 h
    expect(ok.find((l) => l.key === "cu")!.maxConcurrentUsers).toBe(Infinity);
    const over = capacityLimits({ ...DEFAULT_CAPACITY_INPUT, hoursPerDay: 24, daysPerMonth: 30 }); // 720 h
    expect(over.find((l) => l.key === "cu")!.maxConcurrentUsers).toBe(0);
    expect(bottleneck(over).key).toBe("cu");
  });

  it("faixas de alerta: 70% atenção, 90% crítico", () => {
    expect(usageLevel(0.69)).toBe("ok");
    expect(usageLevel(0.7)).toBe("atencao");
    expect(usageLevel(0.9)).toBe("critico");
  });

  it("formatação", () => {
    expect(formatUsers(9.9)).toBe("9");
    expect(formatUsers(Infinity)).toBe("sem limite");
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
    expect(formatBytes(1536)).toBe("1,5 KB");
  });

  it("projeção linear até o fim do ciclo", () => {
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-10-31T00:00:00Z");
    expect(projectToPeriodEnd(10, start, end, new Date("2026-10-16T00:00:00Z"))).toBeCloseTo(20);
    expect(projectToPeriodEnd(10, start, end, new Date("2026-10-01T00:30:00Z"))).toBeNull();
  });
});
