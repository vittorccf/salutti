import { afterEach, describe, expect, it, vi } from "vitest";

// DNS simulado: o teste não depende de rede.
const dnsMock = vi.hoisted(() => ({ resolveMx: vi.fn(), resolve4: vi.fn() }));
vi.mock("node:dns", () => ({ promises: dnsMock }));
import { countryOptions, describePhone, toE164, whatsappLink } from "@/lib/phone";
import { suggestEmail } from "@/lib/email";
import { readAddress, validEmail, validPhone, ContactError } from "@/lib/contact-validation";
import { formatAddress } from "@/lib/address";
import { lookupCep } from "@/lib/cep";

afterEach(() => vi.unstubAllGlobals());

describe("telefone internacional", () => {
  it("converte para E.164 a partir do país escolhido", () => {
    expect(toE164("(62) 99999-0000", "BR")).toBe("+5562999990000");
    expect(toE164("912 345 678", "PT")).toBe("+351912345678");
    expect(toE164("+1 213 373 4253")).toBe("+12133734253");
    expect(toE164("123", "BR")).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("exibe nacional para o Brasil e internacional para outros países, com o país para a bandeira", () => {
    expect(describePhone("+5562999990000")).toEqual({ country: "BR", display: "(62) 99999-0000", e164: "+5562999990000" });
    expect(describePhone("+351912345678")).toMatchObject({ country: "PT", display: "+351 912 345 678" });
    // Número antigo, sem DDI: tratado como do Brasil.
    expect(describePhone("62999990000")).toMatchObject({ country: "BR", e164: "+5562999990000" });
    expect(describePhone(null)).toBeNull();
  });

  it("lista países com DDI, Brasil primeiro, nomes no idioma pedido", () => {
    const pt = countryOptions("pt-BR");
    expect(pt[0]).toMatchObject({ code: "BR", dial: "+55", name: "Brasil" });
    expect(pt.find((c) => c.code === "PT")).toMatchObject({ dial: "+351" });
    expect(pt.length).toBeGreaterThan(200);
    expect(countryOptions("en").find((c) => c.code === "DE")?.name).toBe("Germany");
  });

  it("valida no servidor e monta o link do WhatsApp", () => {
    expect(validPhone("+5562999990000")).toBe("+5562999990000");
    expect(validPhone("")).toBeNull();
    expect(() => validPhone("999")).toThrow(ContactError);
    expect(whatsappLink("+5562999990000", "Oi")).toBe("https://wa.me/5562999990000?text=Oi");
  });

  it("recusa celular sem o 9º dígito, 0800 e interpreta pelo país escolhido", () => {
    expect(toE164("(62) 9999-0000", "BR")).toBeNull();
    expect(toE164("0800 123 4567", "BR")).toBeNull();
    expect(toE164("(62) 3221-0000", "BR")).toBe("+556232210000");
    // Número digitado sem DDI com Portugal escolhido não vira brasileiro.
    expect(validPhone("912345678", { country: "PT" })).toBe("+351912345678");
    expect(() => validPhone("912345678", { country: "BR" })).toThrow(ContactError);
  });

  it("telefone antigo fora do padrão, não alterado, continua como está", () => {
    expect(validPhone("ligar p/ mãe", { previous: "ligar p/ mãe" })).toBe("ligar p/ mãe");
    expect(() => validPhone("ligar p/ mãe")).toThrow(ContactError);
  });
});

describe("e-mail", () => {
  it("sugere o domínio certo para erros de digitação", () => {
    expect(suggestEmail("ana@gmial.com")).toBe("ana@gmail.com");
    expect(suggestEmail("ana@hotmial.com")).toBe("ana@hotmail.com");
    expect(suggestEmail("ana@gmail.con")).toBe("ana@gmail.com");
    expect(suggestEmail("ana@gmail.com")).toBeNull();
    expect(suggestEmail("ana@clinicaacolher.com.br")).toBeNull();
    // Domínios reais parecidos com os comuns não são "corrigidos".
    expect(suggestEmail("ana@ymail.com")).toBeNull();
    expect(suggestEmail("ana@msn.com")).toBeNull();
  });

  it("domínio sem MX nem A é recusado, sem citar o e-mail na mensagem; falha de rede não bloqueia", async () => {
    const nx = Object.assign(new Error("x"), { code: "ENOTFOUND" });
    dnsMock.resolveMx.mockRejectedValue(nx);
    dnsMock.resolve4.mockRejectedValue(nx);
    const err = await validEmail("ana@dominio-que-nao-existe.com").catch((e) => e);
    expect(err).toBeInstanceOf(ContactError);
    expect(err.message).not.toContain("ana@");
    // E-mail que não mudou na edição não passa pelo DNS.
    expect(await validEmail("ana@dominio-que-nao-existe.com", { previous: "ana@dominio-que-nao-existe.com" })).toBe(
      "ana@dominio-que-nao-existe.com",
    );
    dnsMock.resolveMx.mockRejectedValue(Object.assign(new Error("x"), { code: "ECONNREFUSED" }));
    expect(await validEmail("Ana@Exemplo.com")).toBe("ana@exemplo.com");
    dnsMock.resolveMx.mockResolvedValue([{ exchange: "mx.exemplo.com", priority: 10 }]);
    expect(await validEmail("ana@exemplo.com")).toBe("ana@exemplo.com");
  });
});

describe("endereço e CEP", () => {
  it("lê e formata o endereço estruturado", () => {
    const fd = new FormData();
    fd.set("cep", "74000-000");
    fd.set("street", "Rua 1");
    fd.set("addressNumber", "10");
    fd.set("city", "Goiânia");
    fd.set("state", "go");
    const a = readAddress(fd);
    expect(a).toMatchObject({ cep: "74000000", state: "GO", complement: null });
    expect(formatAddress(a)).toBe("Rua 1, 10 · Goiânia/GO · 74000-000");
    fd.set("cep", "123");
    expect(() => readAddress(fd)).toThrow(ContactError);
    expect(formatAddress({})).toBeNull();
  });

  it("ViaCEP responde: usa o endereço dele", async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ logradouro: "Avenida Goiás", bairro: "Centro", localidade: "Goiânia", uf: "GO" })),
    );
    vi.stubGlobal("fetch", f);
    expect(await lookupCep("74005-010")).toEqual({ cep: "74005010", street: "Avenida Goiás", district: "Centro", city: "Goiânia", state: "GO" });
    expect(String(f.mock.calls[0][0])).toContain("viacep.com.br/ws/74005010");
  });

  it("CEP inexistente no ViaCEP → null, sem consultar a reserva", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ erro: "true" })));
    vi.stubGlobal("fetch", f);
    expect(await lookupCep("00000000")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("ViaCEP fora do ar → BrasilAPI; os dois fora → indisponível", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("erro", { status: 502 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ street: "Rua X", neighborhood: "Y", city: "Z", state: "SP" }))),
    );
    expect(await lookupCep("01001000")).toMatchObject({ street: "Rua X", state: "SP" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rede")));
    expect(await lookupCep("01001000")).toBe("indisponivel");
    expect(await lookupCep("123")).toBeNull();
  });
});
