import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildTissLote, tissProfile, tissXmlBytes, type GuideInput, type LoteInput } from "@/lib/tiss";
import { parseDateTimeLocal } from "@/lib/dates";
import { validateTiss } from "../helpers/tiss-xsd";

const validate = (xml: string) => validateTiss(tissXmlBytes(xml));

const psicologa = tissProfile({ professionalType: "psicologo", councilType: "CRP", noCouncil: false });
const psiquiatra = tissProfile({ professionalType: "psiquiatra", councilType: "CRM", noCouncil: false });

const guia = (over: Partial<GuideInput> = {}): GuideInput => ({
  numeroGuiaPrestador: "1001",
  beneficiario: { carteira: "0012345678901" },
  profissional: { nome: "Larissa Mendes", conselho: "09", numeroConselho: "09/12345", uf: "52", cbos: "251510" },
  inicio: parseDateTimeLocal("2026-10-06T14:00"),
  fim: parseDateTimeLocal("2026-10-06T14:50"),
  tipoConsulta: "2",
  regime: "01",
  procedimento: { codigo: "50000470", descricao: "Sessão de psicoterapia individual por psicólogo" },
  valor: 120,
  ...over,
});

const lote = (over: Partial<LoteInput> = {}): LoteInput => ({
  sequencialTransacao: "7",
  numeroLote: "7",
  registroANS: "123456",
  prestador: { kind: "codigo", value: "PREST-001" },
  cnes: null,
  guideType: "sp_sadt",
  guias: [guia(), guia({ numeroGuiaPrestador: "1002", regime: "05", valor: 150.5 })],
  geradoEm: parseDateTimeLocal("2026-10-07T09:30"),
  ...over,
});

// Recalcula o hash a partir do arquivo final (independente do gerador).
const hashFromFile = (xml: string) => {
  const text = Buffer.from(tissXmlBytes(xml)).toString("latin1");
  const leaves = [...text.matchAll(/<ans:(\w[\w-]*)>([^<]*)<\/ans:\1>/g)]
    .filter(([, tag, v]) => tag !== "hash" && v.trim())
    .map(([, , v]) => v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  return crypto.createHash("md5").update(leaves.join(""), "utf8").digest("hex");
};

describe("perfil TISS por profissional (tabelas oficiais)", () => {
  it("psicólogo → SP/SADT 50000470, CRP 09, CBO 251510", () => {
    expect(psicologa).toMatchObject({ ok: true, guideType: "sp_sadt", conselho: "09", cbos: "251510", procedimento: { codigo: "50000470" } });
  });
  it("psiquiatra → consulta 10101012, CRM 06, CBO 225133", () => {
    expect(psiquiatra).toMatchObject({ ok: true, guideType: "consulta", conselho: "06", cbos: "225133", procedimento: { codigo: "10101012" } });
  });
  it("sem conselho e odontologia são recusados com motivo", () => {
    expect(tissProfile({ professionalType: "psicanalista", councilType: "sem_registro", noCouncil: true }).ok).toBe(false);
    expect(tissProfile({ professionalType: "dentista", councilType: "CRO", noCouncil: false })).toMatchObject({ ok: false });
  });
});

describe("lote TISS 4.03.00", () => {
  it("guia SP/SADT válida contra o XSD oficial", async () => {
    const { xml, hash, total } = buildTissLote(lote());
    const r = await validate(xml);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(total).toBe(270.5);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(xml).toContain(`<ans:hash>${hash}</ans:hash>`);
    expect(xml).toContain("<ans:regimeAtendimento>05</ans:regimeAtendimento>");
    expect(xml).toContain("<ans:horaInicial>14:00:00</ans:horaInicial>");
    expect(xml).toContain("<ans:CNES>9999999</ans:CNES>");
  });

  it("guia de consulta válida contra o XSD oficial (prestador por CNPJ, com CNES)", async () => {
    const { xml } = buildTissLote(
      lote({
        guideType: "consulta",
        prestador: { kind: "cnpj", value: "12.345.678/0001-90" },
        cnes: "1234567",
        guias: [
          guia({
            profissional: { nome: "Dr. Paulo", conselho: "06", numeroConselho: "12345", uf: "35", cbos: "225133" },
            procedimento: { codigo: "10101012", descricao: "Consulta em consultório" },
            tipoConsulta: "1",
          }),
        ],
      }),
    );
    const r = await validate(xml);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(xml).toContain("<ans:CNPJ>12345678000190</ans:CNPJ>");
  });

  it("hash do epílogo confere quando recalculado a partir do arquivo", () => {
    const { xml, hash } = buildTissLote(lote());
    expect(hashFromFile(xml)).toBe(hash);
  });

  it("acentos saem em ISO-8859-1 e caracteres especiais são escapados", () => {
    const { xml } = buildTissLote(
      lote({ guias: [guia({ profissional: { nome: "João & Conceição <Teste>", conselho: "09", numeroConselho: "1", uf: "52", cbos: "251510" } })] }),
    );
    const bytes = tissXmlBytes(xml);
    expect(bytes.includes(Buffer.from("Conceição", "latin1"))).toBe(true);
    expect(xml).toContain("João &amp; Conceição &lt;Teste&gt;");
    expect(xml).not.toContain("nomeBeneficiario");
  });

  it("XML adulterado deixa de bater com o XSD (o teste de fato valida)", async () => {
    const { xml } = buildTissLote(lote());
    const r = await validate(xml.replace("<ans:caraterAtendimento>1<", "<ans:caraterAtendimento>7<"));
    expect(r.valid).toBe(false);
  });

  it("recusa registro ANS inválido e lote vazio ou acima de 100 guias", () => {
    expect(() => buildTissLote(lote({ registroANS: "12345" }))).toThrow("6 dígitos");
    expect(() => buildTissLote(lote({ guias: [] }))).toThrow("1 a 100");
    expect(() => buildTissLote(lote({ guias: Array.from({ length: 101 }, () => guia()) }))).toThrow("1 a 100");
  });
});
