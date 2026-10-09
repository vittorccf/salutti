import { describe, expect, it } from "vitest";
import {
  ALL_BO_PERMISSIONS,
  BO_ROLE_DEFAULTS,
  diffFromRole,
  effectiveBoPermissions,
  grantProblem,
  isBoPermission,
  type BoPermission,
} from "@/lib/backoffice/permissions";
import { APP_PERMISSIONS, appDiffFromRole, appGrantProblem, effectiveAppPermissions, lockedFor, type AppPermission } from "@/lib/app-permissions";
import { enabledModules, moduleEnabled } from "@/lib/areas";

describe("backoffice: permissões", () => {
  it("efetivas = papel + concedidas − negadas; chave desconhecida ou herdada não vale", () => {
    const u = { role: "suporte", permsGranted: ["planos.editar", "toString", "inexistente"], permsDenied: ["chamados.responder"] };
    const eff = effectiveBoPermissions(u);
    expect(eff.has("planos.editar")).toBe(true);
    expect(eff.has("chamados.responder")).toBe(false);
    expect(eff.has("chamados.ver")).toBe(true);
    expect(isBoPermission("toString")).toBe(false);
    expect(effectiveBoPermissions({ role: "admin", permsGranted: [], permsDenied: [] }).size).toBe(ALL_BO_PERMISSIONS.length);
    expect(effectiveBoPermissions({ role: "desconhecido", permsGranted: [], permsDenied: [] }).size).toBe(0);
  });

  it("grava só o que difere do papel", () => {
    const desired = new Set<BoPermission>([...BO_ROLE_DEFAULTS.suporte.filter((p) => p !== "chamados.responder"), "auditoria.ver"]);
    expect(diffFromRole("suporte", desired)).toEqual({ permsGranted: ["auditoria.ver"], permsDenied: ["chamados.responder"] });
  });

  it("contra escalonamento: não edita a si mesmo nem dá ou tira o que não tem", () => {
    const actor = { id: "a", role: "suporte", permsGranted: [], permsDenied: [] };
    const before = new Set<BoPermission>(["chamados.ver"]);
    expect(grantProblem(actor, "a", before, before)).toBe("self");
    expect(grantProblem(actor, "b", before, new Set<BoPermission>(["chamados.ver", "equipe.gerenciar"]))).toBe("escalation");
    expect(grantProblem(actor, "b", before, new Set<BoPermission>(["chamados.ver", "chamados.responder"]))).toBeNull();
    // Retirar o que você não tem também não pode.
    expect(grantProblem(actor, "b", new Set<BoPermission>(["auditoria.ver"]), new Set())).toBe("escalation");
  });
});

describe("app: permissões dos membros", () => {
  it("padrão de cada papel mantém o acesso de antes", () => {
    expect(effectiveAppPermissions("owner").size).toBe(APP_PERMISSIONS.length);
    const recepcao = effectiveAppPermissions("receptionist");
    expect(recepcao.has("agenda.gerenciar")).toBe(true);
    expect(recepcao.has("clinico.ver")).toBe(false);
    expect(recepcao.has("financeiro.pagar")).toBe(false);
    expect(effectiveAppPermissions("financial").has("financeiro.pagar")).toBe(true);
    expect(effectiveAppPermissions("professional").has("clinico.ver")).toBe(true);
  });

  it("sigilo clínico é regra fixa: recepção e financeiro não recebem prontuário nem por ajuste", () => {
    expect(effectiveAppPermissions("receptionist", ["clinico.ver"]).has("clinico.ver")).toBe(false);
    expect(lockedFor("financial", "clinico.ver")).toBe(true);
    expect(appDiffFromRole("receptionist", new Set<AppPermission>(["clinico.ver"])).permsGranted).toEqual([]);
  });

  it("dono não perde nada e ajustes negados valem para os outros", () => {
    expect(effectiveAppPermissions("owner", [], ["financeiro.pagar"]).has("financeiro.pagar")).toBe(true);
    expect(effectiveAppPermissions("professional", [], ["financeiro.receber"]).has("financeiro.receber")).toBe(false);
  });

  it("quem pode editar quem", () => {
    const owner = { role: "owner", userId: "o", perms: effectiveAppPermissions("owner") };
    const admin = { role: "admin", userId: "a", perms: effectiveAppPermissions("admin", [], ["lgpd.gerenciar"]) };
    const pro = { role: "professional", userId: "p" };
    const before = effectiveAppPermissions("professional");
    expect(appGrantProblem(owner, { role: "owner", userId: "x" }, before, before)).toBe("owner");
    expect(appGrantProblem(admin, { role: "admin", userId: "b" }, before, before)).toBe("peer");
    expect(appGrantProblem(admin, { role: "admin", userId: "a" }, before, before)).toBe("self");
    expect(appGrantProblem(admin, pro, before, new Set([...before, "lgpd.gerenciar"]))).toBe("escalation");
    expect(appGrantProblem(admin, pro, before, new Set([...before, "financeiro.pagar"]))).toBeNull();
  });
});

describe("liberações por cliente", () => {
  it("padrão da área + liberado − bloqueado", () => {
    const ws = { area: "mental", modulesAdded: ["estoque"], modulesRemoved: ["portal"] };
    expect(moduleEnabled(ws, "estoque")).toBe(true);
    expect(moduleEnabled(ws, "portal")).toBe(false);
    expect(moduleEnabled(ws, "prontuario")).toBe(true);
    expect(moduleEnabled("mental", "estoque")).toBe(false);
    expect(enabledModules({ area: "estetica" })).toContain("procedimentos");
    expect(enabledModules({ area: "estetica" })).not.toContain("convenios");
  });
});

describe("textos das permissões", () => {
  it("cada permissão do app tem rótulo nos 4 idiomas (chave sem ponto, que o next-intl leria como nível)", async () => {
    const fs = await import("node:fs");
    for (const l of ["pt-BR", "pt-PT", "es", "en"]) {
      const items = JSON.parse(fs.readFileSync(`messages/${l}/settings.json`, "utf8")).access.permissions.items as Record<string, string>;
      for (const k of Object.keys(items)) expect(k).not.toContain(".");
      for (const p of APP_PERMISSIONS) expect(items[p.replace(".", "_")], `${l}: ${p}`).toBeTruthy();
    }
  });
});
