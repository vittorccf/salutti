import { describe, expect, it } from "vitest";
import { defaultPriority, newTicketSchema, sanitizePageUrl } from "../../src/lib/support";

describe("chamados de suporte", () => {
  it("guarda só o caminho da página (query e hash podem ter dados de paciente)", () => {
    expect(sanitizePageUrl("https://salutti.vercel.app/app/pacientes?q=Maria%20Silva#x")).toBe("/app/pacientes");
    expect(sanitizePageUrl("/app/agenda?dia=2026-10-07")).toBe("/app/agenda");
    expect(sanitizePageUrl(undefined)).toBeNull();
  });

  it("bug e acesso começam com prioridade alta", () => {
    expect(defaultPriority("bug")).toBe("alta");
    expect(defaultPriority("acesso")).toBe("alta");
    expect(defaultPriority("duvida")).toBe("normal");
  });

  it("valida o que o toggle envia", () => {
    expect(newTicketSchema.safeParse({ subject: "Er", message: "Não salva" }).success).toBe(false);
    const ok = newTicketSchema.parse({ subject: "  Agenda não salva  ", message: "Cliquei em salvar e nada." });
    expect(ok.category).toBe("bug");
    expect(ok.subject).toBe("Agenda não salva");
    expect(newTicketSchema.safeParse({ category: "xpto", subject: "Assunto", message: "Mensagem" }).success).toBe(false);
  });
});
