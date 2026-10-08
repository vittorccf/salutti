// Gestão de Recursos do backoffice: limites dos planos contratados e a conta de "quantos usuários cabem".
// Sem dependência de servidor: a página usa no servidor e a calculadora usa no navegador.

// Planos em uso, conferidos em 2026-10-07 (Vercel: time vittor-freitas-projects; Neon: integração salutti-db).
// Quando um plano mudar, atualize aqui e a data em LIMITS_CHECKED_AT.
export const LIMITS_CHECKED_AT = "2026-10-07";

export const VERCEL_PLAN = {
  name: "Hobby",
  source: "https://vercel.com/docs/limits/fair-use-guidelines",
  commercialUseAllowed: false,
  // Cota mensal incluída. Passou da cota no Hobby, a Vercel pode pausar o projeto até o ciclo seguinte.
  monthly: {
    invocations: 1_000_000,
    activeCpuHours: 4,
    provisionedMemoryGbHours: 360,
    fastDataTransferGb: 100,
    fastOriginTransferGb: 10,
    imageTransformations: 5_000,
  },
  concurrentExecutions: 30_000,
  burstPer10s: 1_000,
  runtimeLogsRetention: "1 hora",
  deploymentsPerDay: 100,
} as const;

export const NEON_PLAN = {
  name: "Free",
  source: "https://neon.com/docs/introduction/plans",
  storageBytes: 1024 ** 3, // 1 GB por projeto
  cuHoursPerMonth: 100,
  egressBytesPerMonth: 5 * 1024 ** 3, // 5 GB por projeto
  maxCu: 2,
  minCu: 0.25,
  scaleToZeroMinutes: 5,
  branches: 10,
  poolerMaxClients: 10_000,
} as const;

// max_connections do Postgres da Neon por tamanho de compute (https://neon.com/docs/connect/connection-pooling).
export const NEON_MAX_CONNECTIONS: Record<string, number> = { "0.25": 104, "0.5": 209, "1": 419, "2": 839 };

// Faixas de alerta usadas em toda a tela.
export type UsageLevel = "ok" | "atencao" | "critico";
export const usageLevel = (fraction: number): UsageLevel => (fraction >= 0.9 ? "critico" : fraction >= 0.7 ? "atencao" : "ok");

// Hipóteses de uso. Os valores padrão são estimativas para um app como a Salutti (páginas renderizadas no servidor,
// poucas consultas por tela). Medir no painel da Vercel (Usage) e ajustar na calculadora.
export type CapacityInput = {
  hoursPerDay: number; // horas por dia com gente usando
  daysPerMonth: number; // dias de uso no mês
  secondsBetweenPages: number; // intervalo médio entre uma tela e outra, por pessoa
  invocationsPerPage: number; // funções disparadas por tela (página + actions + APIs)
  cpuMsPerPage: number; // CPU ativa por tela na Vercel, em ms
  originKbPerPage: number; // bytes da função até a CDN (Fast Origin Transfer)
  transferKbPerPage: number; // bytes da CDN até o navegador (Fast Data Transfer, inclui JS e imagens)
  dbKbPerPage: number; // bytes do banco até a função (egress da Neon)
  averageCu: number; // tamanho médio do compute da Neon enquanto acordado
};

export const DEFAULT_CAPACITY_INPUT: CapacityInput = {
  hoursPerDay: 10,
  daysPerMonth: 22,
  secondsBetweenPages: 30,
  invocationsPerPage: 2,
  cpuMsPerPage: 40,
  originKbPerPage: 40,
  transferKbPerPage: 150,
  dbKbPerPage: 15,
  averageCu: 0.25,
};

export type CapacityLimit = {
  key: string;
  label: string;
  // Usuários simultâneos (durante todo o horário de uso) que ainda cabem na cota do mês. Infinity = não limita.
  maxConcurrentUsers: number;
  detail: string;
};

const KB = 1024;
const GB = 1024 ** 3;

// Telas por mês geradas por UMA pessoa usando o app o tempo todo no horário informado.
export const pagesPerUserMonth = (i: CapacityInput) =>
  (3600 / Math.max(1, i.secondsBetweenPages)) * i.hoursPerDay * i.daysPerMonth;

export const capacityLimits = (i: CapacityInput): CapacityLimit[] => {
  const perUser = pagesPerUserMonth(i);
  const byPages = (pagesAllowed: number) => (perUser > 0 ? pagesAllowed / perUser : Infinity);
  const awakeHours = i.hoursPerDay * i.daysPerMonth; // banco acordado só no horário de uso (dorme após 5 min)
  const neonCuHours = awakeHours * i.averageCu;
  const v = VERCEL_PLAN.monthly;

  return [
    {
      key: "cpu",
      label: "Vercel · CPU ativa (4 h/mês)",
      maxConcurrentUsers: byPages((v.activeCpuHours * 3_600_000) / Math.max(1, i.cpuMsPerPage)),
      detail: `${i.cpuMsPerPage} ms de CPU por tela`,
    },
    {
      key: "invocations",
      label: "Vercel · Execuções de função (1 mi/mês)",
      maxConcurrentUsers: byPages(v.invocations / Math.max(0.1, i.invocationsPerPage)),
      detail: `${i.invocationsPerPage} execuções por tela`,
    },
    {
      key: "origin",
      label: "Vercel · Fast Origin Transfer (10 GB/mês)",
      maxConcurrentUsers: byPages((v.fastOriginTransferGb * GB) / Math.max(1, i.originKbPerPage * KB)),
      detail: `${i.originKbPerPage} KB por tela`,
    },
    {
      key: "transfer",
      label: "Vercel · Fast Data Transfer (100 GB/mês)",
      maxConcurrentUsers: byPages((v.fastDataTransferGb * GB) / Math.max(1, i.transferKbPerPage * KB)),
      detail: `${i.transferKbPerPage} KB por tela`,
    },
    {
      key: "egress",
      label: "Neon · Transferência do banco (5 GB/mês)",
      maxConcurrentUsers: byPages(NEON_PLAN.egressBytesPerMonth / Math.max(1, i.dbKbPerPage * KB)),
      detail: `${i.dbKbPerPage} KB do banco por tela`,
    },
    {
      key: "cu",
      label: "Neon · Compute (100 CU-h/mês)",
      // Não depende do número de pessoas, só do tempo acordado e do tamanho do compute.
      maxConcurrentUsers: neonCuHours <= NEON_PLAN.cuHoursPerMonth ? Infinity : 0,
      detail: `${Math.round(neonCuHours)} CU-h no mês (${awakeHours} h acordado × ${i.averageCu} CU)`,
    },
    {
      key: "concurrency",
      label: "Vercel · Execuções simultâneas (30 mil)",
      // Uma tela leva bem menos de 1 s de função; cada pessoa ocupa ~(execuções × 0,3 s) a cada intervalo.
      maxConcurrentUsers:
        VERCEL_PLAN.concurrentExecutions / ((Math.max(0.1, i.invocationsPerPage) * 0.3) / Math.max(1, i.secondsBetweenPages)),
      detail: "pico instantâneo, raramente é o limite",
    },
  ];
};

export const bottleneck = (limits: CapacityLimit[]) =>
  limits.reduce((min, l) => (l.maxConcurrentUsers < min.maxConcurrentUsers ? l : min), limits[0]);

// Para mostrar "N usuários": arredonda para baixo e trata o infinito.
export const formatUsers = (n: number) =>
  Number.isFinite(n) ? new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.floor(n))) : "sem limite";

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
};

// Projeção linear até o fim do período: consumo até agora ÷ fração do período já passada.
export const projectToPeriodEnd = (used: number, start: Date, end: Date, now = new Date()) => {
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(total, Math.max(0, now.getTime() - start.getTime()));
  if (total <= 0 || elapsed < 60 * 60 * 1000) return null; // menos de 1 h de dados: projeção não diz nada
  return (used * total) / elapsed;
};
