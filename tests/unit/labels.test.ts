import { describe, expect, it } from "vitest";
import {
  chargeDisplayStatus,
  modalityLabel,
  noteTypeLabel,
  paymentMethodLabel,
  planTierLabel,
  professionalTypeLabel,
  segmentLabel,
} from "@/lib/labels";
import { consentPurposeLabel, legalBasisLabel } from "@/lib/lgpd";
import { moodLabel } from "@/lib/mood";
import { formatBRL, formatPercentBR, plural } from "@/lib/utils";
import { parseDateOnly, parseDateTimeLocal } from "@/lib/dates";

describe("rótulos em pt-BR", () => {
  it("traduz códigos do banco e devolve o valor desconhecido legível", () => {
    expect(paymentMethodLabel("card")).toBe("Cartão");
    expect(paymentMethodLabel(null)).toBe("-");
    expect(noteTypeLabel("plano_terapeutico")).toBe("Plano terapêutico");
    expect(modalityLabel("online")).toBe("Online");
    expect(planTierLabel("trial")).toBe("Teste grátis");
    expect(segmentLabel("solo_psicologo")).toBe("Psicologia");
    expect(professionalTypeLabel("psicologo")).toBe("Psicólogo");
    expect(legalBasisLabel("obrigacao_legal")).toBe("Obrigação legal");
    expect(consentPurposeLabel("tutela_saude")).toBe("Tutela da saúde");
    expect(consentPurposeLabel("novo_valor")).toBe("novo valor");
    // Membro do protótipo não pode virar rótulo.
    expect(paymentMethodLabel("constructor")).toBe("constructor");
  });

  it("humor sem emoji", () => {
    expect(moodLabel(1)).toBe("Muito mal");
    expect(moodLabel(5)).toBe("Muito bem");
    expect(moodLabel(9)).toBe("Muito bem");
  });

  it("status efetivo da cobrança", () => {
    const due = parseDateOnly("2026-10-06");
    expect(chargeDisplayStatus("pending", due, parseDateTimeLocal("2026-10-06T21:00"))).toBe("pending");
    expect(chargeDisplayStatus("pending", due, parseDateTimeLocal("2026-10-07T09:00"))).toBe("overdue");
    expect(chargeDisplayStatus("paid", due, parseDateTimeLocal("2026-10-20T09:00"))).toBe("paid");
  });
});

describe("formatação BR", () => {
  // Intl separa "R$" do valor com espaço não separável.
  const nbsp = (s: string) => s.replace(/ /g, " ");

  it("moeda, percentual e plural", () => {
    expect(nbsp(formatBRL(1250))).toBe("R$ 1.250,00");
    expect(formatPercentBR(12.5)).toBe("12,5%");
    expect(formatPercentBR(-69.23)).toBe("-69,2%");
    expect(formatPercentBR(-0.04)).toBe("0,0%");
    expect(plural(1, "cobrança", "cobranças")).toBe("1 cobrança");
    expect(plural(0, "cobrança", "cobranças")).toBe("0 cobranças");
    expect(plural(1200, "sessão", "sessões")).toBe("1.200 sessões");
    expect(plural(-1, "dia", "dias")).toBe("-1 dia");
  });
});
