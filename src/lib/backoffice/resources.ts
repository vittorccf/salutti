// Medições ao vivo para a tela Gestão de Recursos (/backoffice/recursos). Cada medição falha sozinha:
// se o banco não deixar ler uma estatística, a tela mostra "indisponível" e o resto continua.
import { db } from "@/lib/db";
import { SUPPORT_USER_EMAIL } from "@/lib/support-access";

const settle = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch {
    return null;
  }
};

// Ida e volta até o banco, em ms (mediana de 3 SELECT 1). A primeira pode acordar o compute (scale to zero).
const measureLatency = async () => {
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    samples.push(performance.now() - start);
  }
  const firstMs = samples[0];
  samples.sort((a, b) => a - b);
  return { medianMs: samples[1], firstMs };
};

type TableSize = { name: string; totalBytes: number; rows: number };

export const loadDatabaseStats = async () => {
  const [size, tables, connections, server, media, latency] = await Promise.all([
    settle(async () => {
      const [row] = await db.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`;
      return Number(row.bytes);
    }),
    settle(async () => {
      const rows = await db.$queryRaw<{ name: string; total: bigint; rows: number }[]>`
        SELECT c.relname AS name, pg_total_relation_size(c.oid) AS total, GREATEST(c.reltuples, 0)::float8 AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname = 'public'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 12`;
      return rows.map<TableSize>((r) => ({ name: r.name, totalBytes: Number(r.total), rows: Math.round(Number(r.rows)) }));
    }),
    settle(async () => {
      const [row] = await db.$queryRaw<{ active: bigint; total: bigint; max: string }[]>`
        SELECT count(*) FILTER (WHERE state = 'active') AS active, count(*) AS total, current_setting('max_connections') AS max
        FROM pg_stat_activity WHERE datname = current_database()`;
      return { active: Number(row.active), total: Number(row.total), max: Number(row.max) };
    }),
    settle(async () => {
      const [row] = await db.$queryRaw<{ version: string; started: Date }[]>`
        SELECT current_setting('server_version') AS version, pg_postmaster_start_time() AS started`;
      return row;
    }),
    settle(async () => {
      const agg = await db.mediaFile.aggregate({ _sum: { size: true }, _count: { _all: true } });
      return { bytes: agg._sum.size ?? 0, files: agg._count._all };
    }),
    settle(measureLatency),
  ]);
  return { size, tables, connections, server, media, latency };
};

const DAY = 24 * 60 * 60 * 1000;

// Uso do app: base para projetar crescimento do banco e para saber quanta gente usa ao mesmo tempo.
// "Ativo" = alguém com ação registrada na auditoria do consultório (o app não grava cada visualização).
export const loadAppUsage = async () => {
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms);
  const result = await settle(async () => {
    const [workspaces, users, newWorkspaces30d, active15m, active24h, peak] = await Promise.all([
      db.workspace.count(),
      db.user.count({ where: { email: { not: SUPPORT_USER_EMAIL } } }),
      db.workspace.count({ where: { createdAt: { gte: since(30 * DAY) } } }),
      db.auditLog.groupBy({ by: ["userId"], where: { createdAt: { gte: since(15 * 60 * 1000) }, userId: { not: null } } }),
      db.auditLog.groupBy({ by: ["userId"], where: { createdAt: { gte: since(DAY) }, userId: { not: null } } }),
      // Pico de pessoas distintas com ação na mesma hora, nos últimos 7 dias.
      db.$queryRaw<{ peak: bigint | null }[]>`
        SELECT max(n) AS peak FROM (
          SELECT date_trunc('hour', "createdAt") AS h, count(DISTINCT "userId") AS n
          FROM "AuditLog" WHERE "createdAt" >= ${since(7 * DAY)} AND "userId" IS NOT NULL
          GROUP BY 1
        ) t`,
    ]);
    return {
      workspaces,
      users,
      newWorkspaces30d,
      active15m: active15m.length,
      active24h: active24h.length,
      peakHour7d: Number(peak[0]?.peak ?? 0),
    };
  });
  return result;
};

// Região do banco tirada do host do Neon (ex.: ep-xxx.us-east-1.aws.neon.tech → us-east-1). Sem credenciais.
const neonRegion = () => {
  const host = process.env.PGHOST ?? process.env.POSTGRES_HOST ?? "";
  return host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech/)?.[1] ?? null;
};

// Regiões da Vercel ↔ AWS, para avisar quando função e banco estão longe um do outro.
const VERCEL_TO_AWS: Record<string, string> = {
  iad1: "us-east-1",
  cle1: "us-east-2",
  pdx1: "us-west-2",
  sfo1: "us-west-1",
  gru1: "sa-east-1",
  fra1: "eu-central-1",
  lhr1: "eu-west-2",
  dub1: "eu-west-1",
  cdg1: "eu-west-3",
  hnd1: "ap-northeast-1",
  sin1: "ap-southeast-1",
  syd1: "ap-southeast-2",
};

export const loadRuntimeInfo = () => {
  const vercelRegion = process.env.VERCEL_REGION ?? null;
  const dbRegion = neonRegion();
  const awsOfVercel = vercelRegion ? VERCEL_TO_AWS[vercelRegion] ?? null : null;
  return {
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    vercelRegion,
    dbRegion,
    sameRegion: awsOfVercel && dbRegion ? awsOfVercel === dbRegion : null,
    nodeVersion: process.versions.node,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    neonApiConfigured: Boolean(process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID),
  };
};

// Consumo do mês na Neon. Só com NEON_API_KEY (chave de API da conta Neon, só leitura de uso) e NEON_PROJECT_ID.
export const loadNeonConsumption = async () => {
  const key = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!key || !projectId) return { status: "sem-chave" as const };
  try {
    const res = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: "erro" as const, httpStatus: res.status };
    const { project } = (await res.json()) as {
      project: {
        compute_time_seconds?: number;
        active_time_seconds?: number;
        data_transfer_bytes?: number;
        written_data_bytes?: number;
        consumption_period_start?: string;
        consumption_period_end?: string;
        region_id?: string;
        pg_version?: number;
        default_endpoint_settings?: { autoscaling_limit_min_cu?: number; autoscaling_limit_max_cu?: number };
      };
    };
    return {
      status: "ok" as const,
      // compute_time_seconds conta CPU-segundos; 1 CU = 1 vCPU, então ÷ 3600 ≈ CU-horas.
      cuHours: (project.compute_time_seconds ?? 0) / 3600,
      activeHours: (project.active_time_seconds ?? 0) / 3600,
      egressBytes: project.data_transfer_bytes ?? 0,
      writtenBytes: project.written_data_bytes ?? 0,
      periodStart: project.consumption_period_start ? new Date(project.consumption_period_start) : null,
      periodEnd: project.consumption_period_end ? new Date(project.consumption_period_end) : null,
      minCu: project.default_endpoint_settings?.autoscaling_limit_min_cu ?? null,
      maxCu: project.default_endpoint_settings?.autoscaling_limit_max_cu ?? null,
    };
  } catch {
    return { status: "erro" as const, httpStatus: null };
  }
};
