// Geração de lote de guias no Padrão TISS 4.03.00 (ANS), mensagem ENVIO_LOTE_GUIAS.
// Função pura: recebe os dados prontos e devolve o XML e o hash do epílogo.
// Códigos conferidos nas tabelas oficiais (TUSS 202607): Tab. 22 procedimentos, 23 caráter,
// 24 CBO, 26 conselho, 36 acidente, 50 tipo de atendimento, 52 tipo de consulta, 59 UF, 76 regime.
// O XML é validado contra os XSD oficiais em tests/unit/tiss.test.ts.
import crypto from "node:crypto";
import { TZ } from "./dates";

export const TISS_VERSION = "4.03.00";
const NS = "http://www.ans.gov.br/padroes/tiss/schemas";
// Sem CNES, a ANS orienta preencher 9999999.
export const CNES_NAO_INFORMADO = "9999999";

export type GuideType = "consulta" | "sp_sadt";
export type Prestador = { kind: "codigo" | "cnpj" | "cpf"; value: string };

export type GuideInput = {
  numeroGuiaPrestador: string;
  // Desde a versão 4.00.00 o nome do beneficiário saiu da guia: a identificação é a carteirinha.
  beneficiario: { carteira: string };
  profissional: { nome: string; conselho: string; numeroConselho: string; uf: string; cbos: string };
  inicio: Date;
  fim: Date;
  tipoConsulta: "1" | "2"; // Tab. 52: 1 primeira consulta, 2 retorno
  regime: "01" | "05"; // Tab. 76: 01 ambulatorial, 05 telessaúde
  procedimento: { codigo: string; descricao: string };
  valor: number;
};

export type LoteInput = {
  sequencialTransacao: string;
  numeroLote: string;
  registroANS: string;
  prestador: Prestador;
  cnes?: string | null;
  guideType: GuideType;
  guias: GuideInput[];
  geradoEm: Date;
};

// --- perfil TISS de cada tipo de profissional ---
const CONSELHO: Record<string, string> = { CRM: "06", CRO: "08", CRP: "09" }; // Tab. 26

type Perfil =
  | { ok: true; guideType: GuideType; procedimento: { codigo: string; descricao: string }; cbos: string; conselho: string }
  | { ok: false; motivo: string };

export function tissProfile(p: { professionalType: string; councilType: string; noCouncil: boolean }): Perfil {
  if (p.noCouncil || !CONSELHO[p.councilType]) {
    return { ok: false, motivo: "Convênios exigem registro em conselho (CRP ou CRM) de quem atende." };
  }
  const conselho = CONSELHO[p.councilType];
  if (p.professionalType === "psicologo") {
    return {
      ok: true,
      guideType: "sp_sadt",
      procedimento: { codigo: "50000470", descricao: "Sessão de psicoterapia individual por psicólogo" },
      cbos: "251510",
      conselho,
    };
  }
  if (p.professionalType === "psiquiatra" || p.professionalType === "medico") {
    return {
      ok: true,
      guideType: "consulta",
      procedimento: { codigo: "10101012", descricao: "Consulta em consultório (no horário normal ou preestabelecido)" },
      cbos: p.professionalType === "psiquiatra" ? "225133" : "225125",
      conselho,
    };
  }
  if (p.professionalType === "dentista") {
    return { ok: false, motivo: "Odontologia usa a guia odontológica (GTO), ainda não disponível." };
  }
  return { ok: false, motivo: "Tipo de profissional sem guia TISS configurada." };
}

// --- árvore XML simples: o hash é calculado da mesma árvore que gera o texto ---
type Node = { tag: string; children?: Node[]; text?: string };
const el = (tag: string, children: (Node | null | undefined | false)[]): Node => ({
  tag,
  children: children.filter(Boolean) as Node[],
});
const tx = (tag: string, text: string | number): Node => ({ tag, text: String(text) });

const digits = (s: string) => s.replace(/\D/g, "");
const money = (n: number) => n.toFixed(2);
const clip = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);
// A mensagem vai em ISO-8859-1: troca o que não existe nessa codificação.
const latin1 = (s: string) =>
  [...s.normalize("NFC")]
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : c.normalize("NFD").replace(/[^\x00-\xff]/g, "") || "?"))
    .join("");

const spDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // AAAA-MM-DD
const spTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d);

const prestadorIdent = (p: Prestador) =>
  p.kind === "codigo" ? tx("codigoPrestadorNaOperadora", clip(p.value, 14)) : p.kind === "cnpj" ? tx("CNPJ", digits(p.value)) : tx("CPF", digits(p.value));

const contratado = (p: Prestador) =>
  p.kind === "codigo"
    ? tx("codigoPrestadorNaOperadora", clip(p.value, 14))
    : p.kind === "cnpj"
      ? tx("cnpjContratado", digits(p.value))
      : tx("cpfContratado", digits(p.value));

const beneficiario = (g: GuideInput) =>
  el("dadosBeneficiario", [tx("numeroCarteira", clip(g.beneficiario.carteira, 20)), tx("atendimentoRN", "N")]);

const profissional = (tag: string, g: GuideInput) =>
  el(tag, [
    tx("nomeProfissional", clip(g.profissional.nome, 70)),
    tx("conselhoProfissional", g.profissional.conselho),
    tx("numeroConselhoProfissional", clip(g.profissional.numeroConselho, 15)),
    tx("UF", g.profissional.uf),
    tx("CBOS", g.profissional.cbos),
  ]);

function guiaConsulta(l: LoteInput, g: GuideInput): Node {
  return el("guiaConsulta", [
    el("cabecalhoConsulta", [tx("registroANS", l.registroANS), tx("numeroGuiaPrestador", g.numeroGuiaPrestador)]),
    beneficiario(g),
    el("contratadoExecutante", [contratado(l.prestador), tx("CNES", l.cnes || CNES_NAO_INFORMADO)]),
    profissional("profissionalExecutante", g),
    tx("indicacaoAcidente", "9"), // Tab. 36: não acidente
    el("dadosAtendimento", [
      tx("regimeAtendimento", g.regime),
      tx("dataAtendimento", spDate(g.inicio)),
      tx("tipoConsulta", g.tipoConsulta),
      el("procedimento", [tx("codigoTabela", "22"), tx("codigoProcedimento", g.procedimento.codigo), tx("valorProcedimento", money(g.valor))]),
    ]),
  ]);
}

function guiaSpSadt(l: LoteInput, g: GuideInput): Node {
  // Sem pedido médico de outro profissional, quem executa também consta como solicitante.
  return el("guiaSP-SADT", [
    el("cabecalhoGuia", [tx("registroANS", l.registroANS), tx("numeroGuiaPrestador", g.numeroGuiaPrestador)]),
    beneficiario(g),
    el("dadosSolicitante", [
      el("contratadoSolicitante", [contratado(l.prestador)]),
      tx("nomeContratadoSolicitante", clip(g.profissional.nome, 70)),
      profissional("profissionalSolicitante", g),
    ]),
    el("dadosSolicitacao", [tx("dataSolicitacao", spDate(g.inicio)), tx("caraterAtendimento", "1")]), // Tab. 23: eletivo
    el("dadosExecutante", [el("contratadoExecutante", [contratado(l.prestador)]), tx("CNES", l.cnes || CNES_NAO_INFORMADO)]),
    el("dadosAtendimento", [
      tx("tipoAtendimento", "03"), // Tab. 50: outras terapias
      tx("indicacaoAcidente", "9"),
      tx("regimeAtendimento", g.regime),
    ]),
    el("procedimentosExecutados", [
      el("procedimentoExecutado", [
        tx("sequencialItem", "1"),
        tx("dataExecucao", spDate(g.inicio)),
        tx("horaInicial", spTime(g.inicio)),
        tx("horaFinal", spTime(g.fim)),
        el("procedimento", [tx("codigoTabela", "22"), tx("codigoProcedimento", g.procedimento.codigo), tx("descricaoProcedimento", clip(g.procedimento.descricao, 150))]),
        tx("quantidadeExecutada", "1"),
        tx("reducaoAcrescimo", "1.00"),
        tx("valorUnitario", money(g.valor)),
        tx("valorTotal", money(g.valor)),
      ]),
    ]),
    el("valorTotal", [tx("valorProcedimentos", money(g.valor)), tx("valorTotalGeral", money(g.valor))]),
  ]);
}

// Hash do epílogo: MD5 (hex minúsculo) da concatenação, em ordem, do texto das tags-folha
// não vazias, sem as tags; bytes em UTF-8.
export function tissHash(root: Node) {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.tag === "hash") return;
    if (n.children?.length) n.children.forEach(walk);
    else if (n.text && n.text.trim()) parts.push(n.text);
  };
  walk(root);
  return crypto.createHash("md5").update(parts.join(""), "utf8").digest("hex");
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const render = (n: Node, depth = 0): string => {
  const pad = "  ".repeat(depth);
  if (!n.children?.length) return `${pad}<ans:${n.tag}>${escape(n.text ?? "")}</ans:${n.tag}>`;
  return `${pad}<ans:${n.tag}>\n${n.children.map((c) => render(c, depth + 1)).join("\n")}\n${pad}</ans:${n.tag}>`;
};

export function buildTissLote(l: LoteInput) {
  if (!/^\d{6}$/.test(l.registroANS)) throw new Error("Registro ANS da operadora deve ter 6 dígitos.");
  if (l.guias.length === 0 || l.guias.length > 100) throw new Error("O lote deve ter de 1 a 100 guias.");

  const guia = l.guideType === "consulta" ? guiaConsulta : guiaSpSadt;
  // Textos em ISO-8859-1 antes do hash, para o hash bater com o arquivo enviado.
  const sanitize = (n: Node): Node => (n.children ? { ...n, children: n.children.map(sanitize) } : { ...n, text: latin1(n.text ?? "") });

  const body = sanitize(
    el("mensagemTISS", [
      el("cabecalho", [
        el("identificacaoTransacao", [
          tx("tipoTransacao", "ENVIO_LOTE_GUIAS"),
          tx("sequencialTransacao", clip(l.sequencialTransacao, 12)),
          tx("dataRegistroTransacao", spDate(l.geradoEm)),
          tx("horaRegistroTransacao", spTime(l.geradoEm)),
        ]),
        el("origem", [el("identificacaoPrestador", [prestadorIdent(l.prestador)])]),
        el("destino", [tx("registroANS", l.registroANS)]),
        tx("Padrao", TISS_VERSION),
      ]),
      el("prestadorParaOperadora", [
        el("loteGuias", [tx("numeroLote", clip(l.numeroLote, 12)), el("guiasTISS", l.guias.map((g) => guia(l, g)))]),
      ]),
      el("epilogo", [tx("hash", "")]),
    ]),
  );

  const hash = tissHash(body);
  const epilogo = body.children!.find((c) => c.tag === "epilogo")!;
  epilogo.children = [tx("hash", hash)];

  const inner = render(body).replace("<ans:mensagemTISS>", `<ans:mensagemTISS xmlns:ans="${NS}">`);
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>\n${inner}\n`;
  return { xml, hash, total: l.guias.reduce((s, g) => s + g.valor, 0) };
}

// Arquivo final em ISO-8859-1 (a codificação declarada no XML).
export const tissXmlBytes = (xml: string) => Buffer.from(xml, "latin1");
