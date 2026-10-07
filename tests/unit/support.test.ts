import { describe, expect, it } from "vitest";
import { defaultPriority, newTicketSchema, sanitizePageUrl } from "../../src/lib/support";

describe("chamados de suporte", () => {
  it("guarda só o caminho da página (query e hash podem ter dados de paciente)", () => {
    expect(sanitizePageUrl("https://salutti.vercel.app/app/pacientes?q=Maria%20Silva#x")).toBe("/app/pacientes");
    expect(sanitizePageUrl("/app/agenda?dia=2026-10-07")).toBe("/app/agenda");
    expect(sanitizePageUrl("/app/pacientes/cmuyd12pl0001kf4sa9usmrsf/editar")).toBe("/app/pacientes/[id]/editar");
    expect(sanitizePageUrl(undefined)).toBeNull();
  });

  it("prioridade inicial por tópico", () => {
    expect(defaultPriority("bug")).toBe("alta");
    expect(defaultPriority("acesso")).toBe("alta");
    expect(defaultPriority("privacidade")).toBe("alta");
    expect(defaultPriority("duvida")).toBe("normal");
    expect(defaultPriority("sugestao")).toBe("baixa");
  });

  it("valida o que o toggle envia", () => {
    expect(newTicketSchema.safeParse({ subject: "Er", message: "Não salva" }).success).toBe(false);
    expect(newTicketSchema.safeParse({ subject: "Agenda", message: "Não salva" }).success).toBe(false);
    const ok = newTicketSchema.parse({ category: "bug", subject: "  Agenda não salva  ", message: "Cliquei em salvar e nada." });
    expect(ok.category).toBe("bug");
    expect(ok.subject).toBe("Agenda não salva");
    expect(newTicketSchema.safeParse({ category: "xpto", subject: "Assunto", message: "Mensagem" }).success).toBe(false);
  });
});
