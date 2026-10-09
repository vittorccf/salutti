import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => {} }) }));

import { cpfDigits, formatCpf, isValidCpf } from "@/lib/cpf";
import { canJoin, safeUrl, sessionIcs } from "@/lib/portal";
import { hashInviteToken, newInviteToken, passwordProblem } from "@/lib/portal-auth";

describe("CPF", () => {
  it("confere os dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata e limpa", () => {
    expect(cpfDigits("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("senha do portal", () => {
  const personal = ["52998224725", "19900131"];
  it("aceita frase longa e recusa curta, comum, pessoal e diferente", () => {
    expect(passwordProblem("cafe com leite na varanda", "cafe com leite na varanda", personal)).toBeNull();
    expect(passwordProblem("abc12", "abc12", personal)).toBe("short");
    expect(passwordProblem("12345678", "12345678", personal)).toBe("common");
    expect(passwordProblem("34567890", "34567890", personal)).toBe("common");
    expect(passwordProblem("Senha123", "Senha123", personal)).toBe("common");
    expect(passwordProblem("529.982.247-25", "529.982.247-25", personal)).toBe("personal");
    expect(passwordProblem("1990-01-31", "1990-01-31", personal)).toBe("personal");
    expect(passwordProblem("uma senha boa", "uma senha boa!", personal)).toBe("mismatch");
    expect(passwordProblem("x".repeat(129), "x".repeat(129), personal)).toBe("long");
  });
});

describe("convite", () => {
  it("token aleatório e só o hash no banco", () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newInviteToken()).not.toBe(a);
    expect(hashInviteToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(a)).toBe(hashInviteToken(a));
  });
});

describe("sessão no portal", () => {
  const start = new Date("2026-10-10T14:00:00Z");
  const end = new Date("2026-10-10T14:50:00Z");
  it("botão de entrar só de 15 minutos antes até o fim", () => {
    expect(canJoin(start, end, new Date("2026-10-10T13:44:00Z"))).toBe(false);
    expect(canJoin(start, end, new Date("2026-10-10T13:45:00Z"))).toBe(true);
    expect(canJoin(start, end, new Date("2026-10-10T14:50:00Z"))).toBe(true);
    expect(canJoin(start, end, new Date("2026-10-10T14:51:00Z"))).toBe(false);
  });
  it("link de material só http(s)", () => {
    expect(safeUrl("https://exemplo.com/a b")).toBe("https://exemplo.com/a%20b");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("não é link")).toBeNull();
  });
  it(".ics sem dado clínico e com escape", () => {
    const ics = sessionIcs({ id: "a1", startsAt: start, endsAt: end, title: "Sessão · Clínica; Centro", url: "https://meet.google.com/abc" });
    expect(ics).toContain("DTSTART:20261010T140000Z");
    expect(ics).toContain("SUMMARY:Sessão · Clínica\\; Centro");
    expect(ics).toContain("URL:https://meet.google.com/abc");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
