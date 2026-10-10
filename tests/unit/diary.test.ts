import { describe, expect, it } from "vitest";
import {
  associationStrength,
  csvCell,
  diarySetup,
  instrumentDue,
  instrumentMax,
  mergeQuestions,
  moodWithAndWithout,
  movingAverage,
  parseAnswer,
  parseQuestions,
  pearson,
  scoreInstrument,
  tagCounts,
} from "@/lib/diary";

describe("questionários", () => {
  it("PHQ-9: soma, faixas e item 9 como sinal de risco", () => {
    expect(scoreInstrument("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ score: 0, band: "minimo", risk: false });
    expect(scoreInstrument("phq9", [1, 1, 1, 1, 1, 0, 0, 0, 0])!.band).toBe("leve");
    expect(scoreInstrument("phq9", [2, 2, 2, 2, 2, 0, 0, 0, 0])!.band).toBe("moderado");
    expect(scoreInstrument("phq9", [3, 3, 3, 3, 3, 0, 0, 0, 0])!.band).toBe("moderadamente_grave");
    expect(scoreInstrument("phq9", [3, 3, 3, 3, 3, 3, 2, 0, 0])!.band).toBe("grave");
    expect(scoreInstrument("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 1])).toEqual({ score: 1, band: "minimo", risk: true });
  });
  it("GAD-7 e WHO-5 (bruto × 4)", () => {
    expect(scoreInstrument("gad7", [3, 3, 3, 3, 3, 0, 0])).toEqual({ score: 15, band: "grave", risk: false });
    expect(scoreInstrument("who5", [5, 5, 5, 5, 5])).toEqual({ score: 100, band: "adequado", risk: false });
    expect(scoreInstrument("who5", [2, 2, 2, 2, 2])!.band).toBe("baixo");
    expect(scoreInstrument("who5", [1, 1, 1, 1, 2])!.band).toBe("muito_baixo");
    expect(instrumentMax("phq9")).toBe(27);
    expect(instrumentMax("who5")).toBe(100);
  });
  it("respostas faltando ou fora da escala são recusadas", () => {
    expect(scoreInstrument("gad7", [0, 0, 0])).toBeNull();
    expect(scoreInstrument("gad7", [0, 0, 0, 0, 0, 0, 4])).toBeNull();
    expect(scoreInstrument("gad7", [0, 0, 0, 0, 0, 0, NaN])).toBeNull();
  });
  it("vence a cada N dias (nunca respondido = já vence)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(instrumentDue(null, 14, now)).toBe(true);
    expect(instrumentDue(new Date("2026-10-01T12:00:00Z"), 14, now)).toBe(false);
    expect(instrumentDue(new Date("2026-09-26T12:00:00Z"), 14, now)).toBe(true);
  });
});

describe("configuração", () => {
  it("sem linha no banco vale o básico, sem aceite", () => {
    expect(diarySetup(null)).toMatchObject({ template: "basico", items: ["anxiety", "sleep", "notes"], instruments: [], patientConsentAt: null });
  });
  it("descarta itens, questionários e perguntas inválidos", () => {
    const s = diarySetup({ template: "x", items: ["sleep", "hack"], questions: [{ id: "a", label: "Respirou?", type: "yesno" }, { id: "b", label: 1, type: "scale" }], instruments: ["gad7", "toString"], instrumentEveryDays: 7, patientConsentAt: null });
    expect(s.items).toEqual(["sleep"]);
    expect(s.instruments).toEqual(["gad7"]);
    expect(s.questions).toEqual([{ id: "a", label: "Respirou?", type: "yesno" }]);
    expect(parseQuestions("nada")).toEqual([]);
  });
  it("respostas às perguntas próprias pelo tipo", () => {
    expect(parseAnswer("scale", "7")).toBe(7);
    expect(parseAnswer("scale", "11")).toBeNull();
    expect(parseAnswer("yesno", "sim")).toBe(true);
    expect(parseAnswer("yesno", "nao")).toBe(false);
    expect(parseAnswer("number", "2,5")).toBe(2.5);
    expect(parseAnswer("text", "  ")).toBeNull();
    expect(parseAnswer("text", "x".repeat(400))).toHaveLength(280);
  });
});

describe("estatísticas", () => {
  it("média móvel ignora dias vazios", () => {
    expect(movingAverage([1, null, 3, 5], 2)).toEqual([1, 1, 3, 4]);
    expect(movingAverage([null, null])).toEqual([null, null]);
  });
  it("Pearson e leitura em palavras", () => {
    const base: [number, number][] = [[5, 2], [6, 3], [7, 3], [8, 4], [6, 2], [9, 5], [7, 4]];
    const pairs = [...base, ...base];
    const r = pearson(pairs)!;
    expect(r).toBeGreaterThan(0.8);
    expect(associationStrength(r)).toBe("strong");
    expect(pearson(base)).toBeNull();
    expect(pearson(pairs.map(([x]) => [x, 3] as [number, number]))).toBeNull();
    expect(associationStrength(0.05)).toBe("none");
  });
  it("humor com e sem uma atividade, só com dados suficientes", () => {
    const cards = [
      ...[4, 5, 4, 4, 5].map((mood) => ({ mood, tags: ["exercicio"] })),
      ...[2, 3, 2, 2, 3].map((mood) => ({ mood, tags: [] as string[] })),
      { mood: 2, tags: ["telas"] },
    ];
    expect(moodWithAndWithout(cards, "exercicio")).toEqual({ with: 4.4, without: 2.3, days: 5 });
    expect(moodWithAndWithout(cards, "telas")).toBeNull();
    expect(tagCounts([["a", "b"], ["a"]])).toEqual([["a", 2], ["b", 1]]);
  });
  it("CSV escapa separador e fórmula", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell(null)).toBe("");
    expect(csvCell(-3)).toBe("-3");
  });
});

describe("perguntas próprias", () => {
  const ids = () => {
    let n = 0;
    return () => `n${++n}`;
  };
  const current = [
    { id: "a", label: "Usou álcool?", type: "yesno" as const },
    { id: "b", label: "Vontade de beber", type: "scale" as const },
  ];
  it("mantém o id quando nada mudou e arquiva a que saiu", () => {
    expect(mergeQuestions(current, [{ prevId: "a", label: "Usou álcool?", type: "yesno" }], ids())).toEqual([
      { id: "a", label: "Usou álcool?", type: "yesno" },
      { id: "b", label: "Vontade de beber", type: "scale", archived: true },
    ]);
  });
  it("rótulo ou tipo novo vira pergunta nova; a antiga fica arquivada", () => {
    const out = mergeQuestions(current, [{ prevId: "a", label: "Fez exercício?", type: "yesno" }, { prevId: "b", label: "Vontade de beber", type: "yesno" }], ids());
    expect(out.filter((q) => !q.archived).map((q) => q.id)).toEqual(["n1", "n2"]);
    expect(out.filter((q) => q.archived).map((q) => q.id)).toEqual(["a", "b"]);
  });
  it("id repetido no formulário não duplica", () => {
    const out = mergeQuestions(current, [{ prevId: "a", label: "Usou álcool?", type: "yesno" }, { prevId: "a", label: "Usou álcool?", type: "yesno" }], ids());
    expect(out.filter((q) => !q.archived).map((q) => q.id)).toEqual(["a", "n1"]);
  });
  it("a configuração separa ativas de arquivadas", () => {
    const s = diarySetup({ template: "x", items: [], questions: [{ id: "a", label: "A", type: "text" }, { id: "b", label: "B", type: "text", archived: true }], instruments: [], instrumentEveryDays: 14, patientConsentAt: null });
    expect(s.questions.map((q) => q.id)).toEqual(["a"]);
    expect(s.allQuestions.map((q) => q.id)).toEqual(["a", "b"]);
  });
});
