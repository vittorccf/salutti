// Áreas de atuação da Salutti: a mesma plataforma vestida como marcas diferentes (Salutti, Salutti Estética,
// depois Salutti Odonto...). Toda diferença entre áreas fica aqui (nome, caminho público, segmentos, profissões,
// conselhos, módulos), nunca em `if (estetica)` espalhado pelas telas. A área fica gravada no consultório
// (Workspace.area); dentro do app a marca vem do consultório ativo, não da URL.
import type { AccountType } from "./account";

export type Area = "mental" | "estetica";
export const AREAS_LIST: Area[] = ["mental", "estetica"];
export const isArea = (v: unknown): v is Area => v === "mental" || v === "estetica";
export const areaOf = (v: string | null | undefined): Area => (isArea(v) ? v : "mental");

// Módulos que podem ser ligados ou desligados por área (o menu e as rotas consultam isto).
export type Module = "convenios" | "prontuario" | "procedimentos" | "estoque";

type AreaConfig = {
  name: string;
  /** selo ao lado do logo (null = só o logo). Nome de marca: não se traduz. */
  brandTag: string | null;
  /** página pública da área (inicial, cadastro e login) */
  publicPath: string;
  loginPath: string;
  signupPath: string;
  modules: Record<Module, boolean>;
  /** segmentos por tipo de conta (códigos de Workspace.segment) */
  segments: Record<AccountType, string[]>;
  professionalTypes: string[];
  councils: string[];
};

export const AREAS: Record<Area, AreaConfig> = {
  mental: {
    name: "Salutti",
    brandTag: null,
    publicPath: "/",
    loginPath: "/login",
    signupPath: "/signup",
    modules: { convenios: true, prontuario: true, procedimentos: false, estoque: false },
    segments: { autonomo: ["solo_psicologo", "solo_psicanalista", "odonto"], clinica: ["clinica", "ubs", "odonto"] },
    professionalTypes: ["psicologo", "psicanalista", "terapeuta", "psiquiatra", "dentista", "medico"],
    councils: ["CRP", "CRM", "CRO", "sem_registro"],
  },
  estetica: {
    name: "Salutti Estética",
    brandTag: "Estética",
    publicPath: "/estetica",
    loginPath: "/estetica/login",
    signupPath: "/estetica/cadastro",
    // Procedimentos estéticos não são cobertos por convênio: o módulo de convênios/TISS fica desligado.
    modules: { convenios: false, prontuario: true, procedimentos: true, estoque: true },
    segments: {
      autonomo: [
        "estetica_farmacia",
        "estetica_biomedicina",
        "estetica_esteticista",
        "estetica_enfermagem",
        "estetica_hof",
        "estetica_medicina",
      ],
      clinica: ["estetica_clinica"],
    },
    professionalTypes: ["farmaceutico", "biomedico", "esteticista", "enfermeiro", "dentista", "medico"],
    councils: ["CRF", "CRBM", "COREN", "CRO", "CRM", "sem_registro"],
  },
};

// União de todas as áreas: os formulários validam contra ela (profissional de outra área continua válido).
export const ALL_PROFESSIONAL_TYPES = [...new Set(AREAS_LIST.flatMap((a) => AREAS[a].professionalTypes))] as [string, ...string[]];
export const ALL_COUNCILS = [...new Set(AREAS_LIST.flatMap((a) => AREAS[a].councils))] as [string, ...string[]];

export const moduleEnabled = (area: string | null | undefined, module: Module) => AREAS[areaOf(area)].modules[module];

export const segmentsFor = (area: Area, type: AccountType) => AREAS[area].segments[type];

// Área a que um segmento pertence (cadastros antigos não têm área gravada).
export const areaOfSegment = (segment: string): Area => (segment.startsWith("estetica") ? "estetica" : "mental");

// Profissão e conselho sugeridos no primeiro cadastro profissional, pelo segmento.
export function professionalDefaults(segment: string): { type: string; council: string } {
  switch (segment) {
    case "solo_psicanalista":
      return { type: "psicanalista", council: "sem_registro" };
    case "odonto":
    case "ubs":
    case "estetica_hof":
      return { type: "dentista", council: "CRO" };
    case "estetica_farmacia":
      return { type: "farmaceutico", council: "CRF" };
    case "estetica_biomedicina":
      return { type: "biomedico", council: "CRBM" };
    case "estetica_enfermagem":
      return { type: "enfermeiro", council: "COREN" };
    case "estetica_medicina":
      return { type: "medico", council: "CRM" };
    case "estetica_esteticista":
      // Esteticista é profissão regulamentada (Lei 13.643/2018), sem conselho profissional.
      return { type: "esteticista", council: "sem_registro" };
    case "estetica_clinica":
      return { type: "farmaceutico", council: "CRF" };
    default:
      return { type: "psicologo", council: "CRP" };
  }
}
