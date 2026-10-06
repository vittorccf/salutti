import { describe, expect, it } from "vitest";
import { upcomingBirthdays } from "@/lib/birthdays";
import { parseDateOnly } from "@/lib/dates";
import { autonomoBlockers, segmentAfterMigration, segmentAllowed } from "@/lib/account";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";

const person = (kind: "self" | "professional" | "patient", name: string, birth: string) => ({
  kind,
  id: name,
  name,
  birthDate: parseDateOnly(birth),
});

describe("aniversários", () => {
  // 06/10/2026, 23:30 em São Paulo (02:30 UTC do dia 07): ainda é dia 06 no consultório.
  const now = new Date("2026-10-07T02:30:00Z");

  it("lista hoje e os próximos 7 dias, em ordem, com a idade que a pessoa faz", () => {
    const list = upcomingBirthdays(
      [
        person("patient", "Ana", "1990-10-06"),
        person("patient", "Bruno", "1985-10-13"),
        person("patient", "Caio", "1985-10-14"),
        person("self", "Eu", "1992-10-08"),
        person("professional", "Dra. Lia", "1980-10-06"),
        person("patient", "Duda", "2000-10-05"),
      ],
      now,
    );
    expect(list.map((b) => [b.name, b.daysUntil])).toEqual([
      ["Dra. Lia", 0],
      ["Ana", 0],
      ["Eu", 2],
      ["Bruno", 7],
    ]);
    expect(list[1]).toMatchObject({ turning: 36, dayMonth: "06/10" });
  });

  it("virada do ano e 29/02 em ano não bissexto (lembrado em 28/02)", () => {
    const dez = new Date("2026-12-30T15:00:00Z");
    expect(upcomingBirthdays([person("patient", "Rei", "1990-01-02")], dez)[0]).toMatchObject({ daysUntil: 3, turning: 37 });
    const fev = new Date("2027-02-27T15:00:00Z");
    expect(upcomingBirthdays([person("patient", "Bi", "2000-02-29")], fev)[0]).toMatchObject({ daysUntil: 1, dayMonth: "29/02" });
  });
});

describe("tipo de conta", () => {
  it("áreas de atendimento de cada tipo e a troca de área na migração", () => {
    expect(segmentAllowed("autonomo", "solo_psicologo")).toBe(true);
    expect(segmentAllowed("autonomo", "ubs")).toBe(false);
    expect(segmentAfterMigration("clinica", "solo_psicologo")).toBe("clinica");
    expect(segmentAfterMigration("clinica", "odonto")).toBe("odonto");
    expect(segmentAfterMigration("autonomo", "ubs")).toBe("solo_psicologo");
    expect(segmentAfterMigration("autonomo", "odonto")).toBe("odonto");
  });

  it("clínica só vira autônomo com um profissional ativo e um usuário", () => {
    expect(autonomoBlockers({ activeProfessionals: 1, members: 1 })).toEqual([]);
    expect(autonomoBlockers({ activeProfessionals: 0, members: 1 })).toEqual([]);
    expect(autonomoBlockers({ activeProfessionals: 3, members: 2 })).toHaveLength(2);
  });
});

describe("CNPJ", () => {
  it("valida numérico e alfanumérico (IN RFB 2.229/2024)", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    // Exemplo oficial da Receita Federal para o formato alfanumérico.
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(formatCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });
});
