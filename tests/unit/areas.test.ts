import { describe, expect, it } from "vitest";
import { AREAS, areaOf, areaOfSegment, moduleEnabled, professionalDefaults } from "@/lib/areas";
import { segmentAfterMigration, segmentAllowed } from "@/lib/account";

describe("áreas", () => {
  it("área desconhecida cai na Salutti (mental)", () => {
    expect(areaOf(undefined)).toBe("mental");
    expect(areaOf("odonto")).toBe("odonto");
    expect(areaOf("dentista")).toBe("mental");
    expect(areaOf("estetica")).toBe("estetica");
  });

  it("módulos por área: estética sem convênios, com estoque e procedimentos", () => {
    expect(moduleEnabled("estetica", "convenios")).toBe(false);
    expect(moduleEnabled("estetica", "estoque")).toBe(true);
    expect(moduleEnabled("mental", "estoque")).toBe(false);
    expect(moduleEnabled(null, "convenios")).toBe(true);
  });

  it("segmento indica a área", () => {
    for (const s of [...AREAS.estetica.segments.autonomo, ...AREAS.estetica.segments.clinica]) expect(areaOfSegment(s)).toBe("estetica");
    expect(areaOfSegment("solo_psicologo")).toBe("mental");
  });

  it("profissão e conselho sugeridos pelo segmento", () => {
    expect(professionalDefaults("estetica_farmacia")).toEqual({ type: "farmaceutico", council: "CRF" });
    expect(professionalDefaults("estetica_esteticista")).toEqual({ type: "esteticista", council: "sem_registro" });
    expect(professionalDefaults("solo_psicologo")).toEqual({ type: "psicologo", council: "CRP" });
    expect(professionalDefaults("ubs")).toEqual({ type: "psicologo", council: "CRP" });
    expect(professionalDefaults("odonto")).toEqual({ type: "dentista", council: "CRO" });
    // Profissão e conselho sugeridos sempre existem na lista da área do segmento.
    for (const area of ["mental", "estetica"] as const) {
      for (const s of [...AREAS[area].segments.autonomo, ...AREAS[area].segments.clinica]) {
        const d = professionalDefaults(s);
        expect(AREAS[area].professionalTypes).toContain(d.type);
        expect(AREAS[area].councils).toContain(d.council);
      }
    }
  });

  it("segmento válido depende da área", () => {
    expect(segmentAllowed("autonomo", "estetica_farmacia", "estetica")).toBe(true);
    expect(segmentAllowed("autonomo", "estetica_farmacia")).toBe(false);
    expect(segmentAllowed("clinica", "estetica_farmacia", "estetica")).toBe(false);
  });

  it("troca de tipo de conta mantém a área", () => {
    expect(segmentAfterMigration("clinica", "estetica_farmacia")).toBe("estetica_clinica");
    expect(segmentAfterMigration("autonomo", "estetica_clinica")).toBe("estetica_farmacia");
    expect(segmentAfterMigration("autonomo", "clinica")).toBe("solo_psicologo");
    expect(segmentAfterMigration("clinica", "solo_psicanalista")).toBe("clinica");
    expect(segmentAfterMigration("autonomo", "solo_psicanalista")).toBe("solo_psicanalista");
    expect(segmentAfterMigration("clinica", "odonto")).toBe("odonto");
  });
});
