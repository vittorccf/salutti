import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

// Cookie da sessão do pedido: trocado por teste. A trava recusa antes de chegar ao banco (nenhuma conexão é aberta).
let token: string | undefined;
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => (token ? { value: token } : undefined) }) }));

const { db } = await import("@/lib/db");

const sign = (payload: Record<string, unknown>) => new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("x"));

describe("acesso de suporte: somente leitura no Prisma", () => {
  it("recusa gravação com sessão de suporte, em qualquer modelo fora das exceções", async () => {
    token = await sign({ userId: "u", supportGrantId: "g" });
    await expect(db.patient.create({ data: { workspaceId: "w", fullName: "X" } })).rejects.toThrow("Acesso de suporte: somente leitura.");
    await expect(db.payable.updateMany({ where: { id: "p" }, data: { notes: "x" } })).rejects.toThrow("somente leitura");
    await expect(db.membership.deleteMany({ where: { id: "m" } })).rejects.toThrow("somente leitura");
  });
});
