import { describe, expect, it } from "vitest";
import { generateSupportPassword, grantIsLive, isSupportEmail } from "../../src/lib/support-access";
import { canSeeClinical } from "../../src/lib/permissions";

describe("acesso de suporte", () => {
  it("gera senhas longas, sem caracteres ambíguos e diferentes a cada vez", () => {
    const a = generateSupportPassword();
    const b = generateSupportPassword();
    expect(a).toHaveLength(20);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it("concessão vale só no prazo e enquanto não for revogada nem encerrada", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const base = { expiresAt: new Date("2026-10-07T12:10:00Z"), revokedAt: null, endedAt: null };
    expect(grantIsLive(base, now)).toBe(true);
    expect(grantIsLive({ ...base, expiresAt: new Date("2026-10-07T11:59:59Z") }, now)).toBe(false);
    expect(grantIsLive({ ...base, revokedAt: now }, now)).toBe(false);
    expect(grantIsLive({ ...base, endedAt: now }, now)).toBe(false);
  });

  it("reconhece o e-mail do suporte e o papel não vê conteúdo clínico", () => {
    expect(isSupportEmail(" Suporte_Salutti@salutti.com ")).toBe(true);
    expect(isSupportEmail("guilherme@salutti.dev")).toBe(false);
    expect(canSeeClinical("support")).toBe(false);
  });
});
