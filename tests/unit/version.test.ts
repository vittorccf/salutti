import { describe, expect, it } from "vitest";
import { appVersion, calendarVersion } from "../../scripts/app-version.mjs";

describe("versão do app (CalVer)", () => {
  it("usa a data de São Paulo, não a UTC", () => {
    // 01h UTC do dia 8 ainda é dia 7 em São Paulo.
    expect(calendarVersion(new Date("2026-10-08T01:00:00Z"))).toBe("2026.10.07");
    expect(calendarVersion(new Date("2026-01-05T12:00:00Z"))).toBe("2026.01.05");
  });

  it("produção sem sufixo, com o commit curto", () => {
    expect(appVersion({ commitDate: "2026-10-07T15:00:00-03:00", commitSha: "0ffb679abcdef", vercelEnv: "production" }))
      .toEqual({ version: "2026.10.07", commit: "0ffb679" });
  });

  it("prévia e desenvolvimento ganham sufixo", () => {
    const commitDate = "2026-10-07T15:00:00-03:00";
    expect(appVersion({ commitDate, vercelEnv: "preview" }).version).toBe("2026.10.07-previa");
    expect(appVersion({ commitDate }).version).toBe("2026.10.07-dev");
  });

  it("sem git usa a data do build", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(appVersion({ commitDate: null, commitSha: null, vercelEnv: "production", now }))
      .toEqual({ version: "2026.11.02", commit: "" });
    expect(appVersion({ commitDate: "lixo", vercelEnv: "production", now }).version).toBe("2026.11.02");
  });
});
