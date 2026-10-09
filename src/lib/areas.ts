// Áreas de atuação da Salutti: a mesma plataforma vestida como marcas diferentes (Salutti, Salutti Estética,
// depois Salutti Odonto...). Toda diferença entre áreas fica aqui (nome, caminho público, segmentos, profissões,
// conselhos, módulos), nunca em `if (estetica)` espalhado pelas telas. A área fica gravada no consultório
// (Workspace.area); dentro do app a marca vem do consultório ativo, não da URL.
import type { AccountType } from "./account";

export type Area = "mental" | "estetica";
export const AREAS_LIST: Area[] = ["mental", "estetica"];
export const isArea = (v: unknown): v is Area => v === "mental" || v === "estetica";
export const areaOf = (v: string | null | undefined): Area => (isArea(v) ? v : "mental");

// Módulos que podem ser ligados ou desligados por área e, no backoffice, por cliente (o menu e as rotas consultam isto).
export const MODULES = ["prontuario", "convenios", "procedimentos", "estoque", "portal", "contas_pagar", "cartao_diario"] as const;
export type Module = (typeof MODULES)[number];
export const isModule = (v: string): v is Module => (MODULES as readonly string[]).includes(v);

// Nome do módulo no backoffice (pt-BR).
export const MODULE_LABELS: Record<Module, string> = {
  prontuario: "Prontuário",
  convenios: "Convênios e TISS",
  procedimentos: "Procedimentos estéticos",
  estoque: "Estoque",
  portal: "Portal do paciente",
  contas_pagar: "Contas a pagar e relatórios",
  cartao_diario: "Cartão diário",
};

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
  /** sufixo das chaves de título de login/cadastro (auth.*.title + sufixo): "" na Salutti, "Estetica" na Estética */
  titleKey: "" | "Estetica";
  /** tipo de conta já escolhido no cadastro (null = a pessoa escolhe) */
  defaultAccountType: AccountType | null;
};

export const AREAS: Record<Area, AreaConfig> = {
  mental: {
    name: "Salutti",
    brandTag: null,
    publicPath: "/",
    loginPath: "/login",
    signupPath: "/signup",
    modules: { convenios: true, prontuario: true, procedimentos: false, estoque: false, portal: true, contas_pagar: true, cartao_diario: true },
    segments: { autonomo: ["solo_psicologo", "solo_psicanalista", "odonto"], clinica: ["clinica", "ubs", "odonto"] },
    professionalTypes: ["psicologo", "psicanalista", "terapeuta", "psiquiatra", "dentista", "medico"],
    councils: ["CRP", "CRM", "CRO", "sem_registro"],
    titleKey: "",
    defaultAccountType: null,
  },
  estetica: {
    name: "Salutti Estética",
    brandTag: "Estética",
    publicPath: "/estetica",
    loginPath: "/estetica/login",
    signupPath: "/estetica/cadastro",
    // Procedimentos estéticos não são cobertos por convênio: o módulo de convênios/TISS fica desligado.
    modules: { convenios: false, prontuario: true, procedimentos: true, estoque: true, portal: true, contas_pagar: true, cartao_diario: false },
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
    // Foco da área: a profissional autônoma (a clínica escolhe "Clínica" no cadastro).
    titleKey: "Estetica",
    defaultAccountType: "autonomo",
  },
};

// União de todas as áreas: os formulários validam contra ela (profissional de outra área continua válido).
export const ALL_PROFESSIONAL_TYPES = [...new Set(AREAS_LIST.flatMap((a) => AREAS[a].professionalTypes))] as [string, ...string[]];
export const ALL_COUNCILS = [...new Set(AREAS_LIST.flatMap((a) => AREAS[a].councils))] as [string, ...string[]];

type WorkspaceModules = { area: string | null; modulesAdded?: string[] | null; modulesRemoved?: string[] | null };

// Ligado = padrão da área + liberado pelo backoffice − bloqueado pelo backoffice. Aceita só a área (padrão) ou o consultório.
export function moduleEnabled(ws: string | null | undefined | WorkspaceModules, module: Module) {
  if (ws === null || ws === undefined || typeof ws === "string") return AREAS[areaOf(ws)].modules[module];
  if (ws.modulesRemoved?.includes(module)) return false;
  if (ws.modulesAdded?.includes(module)) return true;
  return AREAS[areaOf(ws.area)].modules[module];
}

export const enabledModules = (ws: WorkspaceModules) => MODULES.filter((m) => moduleEnabled(ws, m));

export const segmentsFor = (area: Area, type: AccountType) => AREAS[area].segments[type];

// Área a que um segmento pertence (cadastros antigos não têm área gravada).
export const areaOfSegment = (segment: string): Area => (segment.startsWith("estetica") ? "estetica" : "mental");

// Profissão e conselho sugeridos no primeiro cadastro profissional, pelo segmento.
export function professionalDefaults(segment: string): { type: string; council: string } {
  switch (segment) {
    case "solo_psicanalista":
      return { type: "psicanalista", council: "sem_registro" };
    case "odonto":
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
