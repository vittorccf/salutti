import { AlertTriangle, CheckCircle2, Database, ExternalLink, Info, Server, Users } from "lucide-react";
import { requireBackoffice } from "@/lib/backoffice/auth";
import {
  formatBytes,
  LIMITS_CHECKED_AT,
  NEON_MAX_CONNECTIONS,
  NEON_PLAN,
  projectToPeriodEnd,
  usageLevel,
  VERCEL_PLAN,
  type UsageLevel,
} from "@/lib/backoffice/capacity";
import { loadAppUsage, loadDatabaseStats, loadNeonConsumption, loadRuntimeInfo } from "@/lib/backoffice/resources";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn, formatDateTimeBR, formatPercentBR } from "@/lib/utils";
import { CapacityCalculator } from "../../_components/capacity-calculator";

export const dynamic = "force-dynamic";

const VERCEL_USAGE_URL = "https://vercel.com/vittor-freitas-projects/~/usage";
const NEON_CONSOLE_URL = "https://console.neon.tech/app/projects";
const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const LEVEL_LABEL: Record<UsageLevel, string> = { ok: "Normal", atencao: "Atenção", critico: "Crítico" };
const LEVEL_VARIANT: Record<UsageLevel, "success" | "warning" | "destructive"> = { ok: "success", atencao: "warning", critico: "destructive" };
const LEVEL_BAR: Record<UsageLevel, string> = { ok: "bg-success", atencao: "bg-warning", critico: "bg-destructive" };

function Meter({ label, used, limit, format, hint }: { label: string; used: number; limit: number; format: (n: number) => string; hint?: string }) {
  const fraction = limit > 0 ? used / limit : 0;
  const level = usageLevel(fraction);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {format(used)} de {format(limit)} · {formatPercentBR(fraction * 100)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(1, fraction) * 100)}
      >
        <div className={cn("h-full rounded-full", LEVEL_BAR[level])} style={{ width: `${Math.min(100, Math.max(1, fraction * 100))}%` }} />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="font-medium">{value}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </div>
  );
}

type Alert = { level: UsageLevel | "info"; title: string; text: string };

export default async function ResourcesPage() {
  await requireBackoffice({ role: "admin" });
  const runtime = loadRuntimeInfo();
  const [dbStats, usage, neon] = await Promise.all([loadDatabaseStats(), loadAppUsage(), loadNeonConsumption()]);

  const storageFraction = dbStats.size !== null ? dbStats.size / NEON_PLAN.storageBytes : null;
  const mediaShare = dbStats.size && dbStats.media ? dbStats.media.bytes / dbStats.size : null;
  const poolSize = dbStats.connections ? Math.floor(dbStats.connections.max * 0.9) : null;
  const currentCu = dbStats.connections
    ? Object.entries(NEON_MAX_CONNECTIONS).find(([, max]) => max === dbStats.connections?.max)?.[0] ?? null
    : null;

  // Crescimento: quanto cada consultório ocupa hoje e quantos ainda cabem no 1 GB.
  const bytesPerWorkspace = dbStats.size && usage?.workspaces ? dbStats.size / usage.workspaces : null;
  const workspacesThatFit =
    bytesPerWorkspace && dbStats.size !== null ? Math.max(0, Math.floor((NEON_PLAN.storageBytes - dbStats.size) / bytesPerWorkspace)) : null;
  const monthsUntilFull =
    workspacesThatFit !== null && usage?.newWorkspaces30d ? workspacesThatFit / usage.newWorkspaces30d : null;

  const neonProjection =
    neon.status === "ok" && neon.periodStart && neon.periodEnd
      ? {
          cuHours: projectToPeriodEnd(neon.cuHours, neon.periodStart, neon.periodEnd),
          egress: projectToPeriodEnd(neon.egressBytes, neon.periodStart, neon.periodEnd),
        }
      : null;

  const alerts: Alert[] = [];
  if (!VERCEL_PLAN.commercialUseAllowed) {
    alerts.push({
      level: "critico",
      title: "Vercel Hobby não permite uso comercial",
      text: "Os termos da Vercel restringem o Hobby a uso pessoal, sem cobrança. A Salutti cobra assinatura pelo Stripe, então precisa do plano Pro (US$ 20/mês por pessoa do time) antes de ter clientes pagantes. O Pro também tira as cotas fixas: passa a cobrar o excedente em vez de pausar o projeto.",
    });
  }
  if (storageFraction !== null && usageLevel(storageFraction) !== "ok") {
    alerts.push({
      level: usageLevel(storageFraction),
      title: `Banco com ${formatPercentBR(storageFraction * 100)} do armazenamento`,
      text: "Ao chegar em 1 GB, a Neon recusa inserções, edições e exclusões até liberar espaço ou mudar para o plano Launch.",
    });
  }
  if (neonProjection?.cuHours && usageLevel(neonProjection.cuHours / NEON_PLAN.cuHoursPerMonth) !== "ok") {
    alerts.push({
      level: usageLevel(neonProjection.cuHours / NEON_PLAN.cuHoursPerMonth),
      title: `Compute da Neon deve fechar o mês em ~${nf.format(neonProjection.cuHours)} CU-h`,
      text: "Passou de 100 CU-h, a Neon suspende o banco até o próximo ciclo: o app inteiro para.",
    });
  }
  if (neonProjection?.egress && usageLevel(neonProjection.egress / NEON_PLAN.egressBytesPerMonth) !== "ok") {
    alerts.push({
      level: usageLevel(neonProjection.egress / NEON_PLAN.egressBytesPerMonth),
      title: `Transferência da Neon deve fechar o mês em ~${formatBytes(neonProjection.egress)}`,
      text: "Passou de 5 GB, a Neon suspende o banco até o próximo ciclo.",
    });
  }
  if (dbStats.connections && poolSize && usageLevel(dbStats.connections.total / dbStats.connections.max) !== "ok") {
    alerts.push({
      level: usageLevel(dbStats.connections.total / dbStats.connections.max),
      title: "Muitas conexões abertas no banco",
      text: "Confira se a DATABASE_URL usa o pooler (host com -pooler). Conexão direta só para migrations.",
    });
  }
  if (runtime.sameRegion === false) {
    alerts.push({
      level: "atencao",
      title: "Funções e banco em regiões diferentes",
      text: `Funções em ${runtime.vercelRegion}, banco em ${runtime.dbRegion}. Cada consulta atravessa a distância; alinhe a região das funções à do banco.`,
    });
  }
  if (mediaShare !== null && mediaShare >= 0.25) {
    alerts.push({
      level: "atencao",
      title: `Imagens ocupam ${formatPercentBR(mediaShare * 100)} do banco`,
      text: "Fotos ficam dentro do Postgres (tabela MediaFile). Se crescer, mover para um armazenamento de arquivos (Vercel Blob) libera o banco.",
    });
  }
  if (neon.status !== "ok") {
    alerts.push({
      level: "info",
      title: "Consumo mensal da Neon não conectado",
      text: "Sem NEON_API_KEY na Vercel, a tela mede o banco por dentro (tamanho, conexões, latência), mas não as CU-horas e a transferência do mês. Veja o passo a passo no fim da página.",
    });
  }

  const worstLevel: UsageLevel = alerts.some((a) => a.level === "critico") ? "critico" : alerts.some((a) => a.level === "atencao") ? "atencao" : "ok";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestão de Recursos</h1>
          <p className="text-sm text-muted-foreground">
            Infraestrutura da Salutti: limites dos planos, consumo e quantos usuários cabem. Medido agora, {formatDateTimeBR(new Date())}.
          </p>
        </div>
        <Badge variant={LEVEL_VARIANT[worstLevel]}>Situação geral: {LEVEL_LABEL[worstLevel]}</Badge>
      </div>

      {alerts.length > 0 ? (
        <section aria-label="Alertas" className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.title}
              className={cn(
                "flex gap-3 rounded-lg border p-3 text-sm",
                a.level === "critico" && "border-destructive/40 bg-destructive/[.06]",
                a.level === "atencao" && "border-warning/40 bg-warning/[.06]",
              )}
            >
              {a.level === "info" ? (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.level === "critico" ? "text-destructive-strong" : "text-warning-strong")} aria-hidden />
              )}
              <div>
                <p className="font-medium">{a.title}</p>
                <p className="text-muted-foreground">{a.text}</p>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success-strong" aria-hidden /> Tudo dentro dos limites.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Banco ocupado</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{dbStats.size !== null ? formatBytes(dbStats.size) : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {storageFraction !== null ? `${formatPercentBR(storageFraction * 100)} de 1 GB` : "Indisponível"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Latência até o banco</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{dbStats.latency ? `${nf.format(dbStats.latency.medianMs)} ms` : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {dbStats.latency && dbStats.latency.firstMs > dbStats.latency.medianMs * 5
              ? `1ª consulta ${nf.format(dbStats.latency.firstMs)} ms (banco estava dormindo)`
              : "Mediana de 3 consultas"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Usando agora</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{usage ? usage.active15m : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {usage ? `${usage.active24h} nas últimas 24 h · pico de ${usage.peakHour7d}/hora em 7 dias` : "Indisponível"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conexões no banco</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{dbStats.connections ? dbStats.connections.total : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {dbStats.connections ? `${dbStats.connections.active} ativas · máximo ${dbStats.connections.max}` : "Indisponível"}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" aria-hidden /> Vercel · aplicação
            </CardTitle>
            <CardDescription>
              Plano {VERCEL_PLAN.name}. Hospeda as telas e as funções do servidor (Next.js).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y">
              <Fact label="Ambiente" value={runtime.environment} hint={runtime.commit ? `versão ${runtime.commit}` : undefined} />
              <Fact label="Região das funções" value={runtime.vercelRegion ?? "local"} />
              <Fact label="Node.js" value={runtime.nodeVersion} />
              <Fact
                label="Usuários simultâneos (técnico)"
                value={`até ${new Intl.NumberFormat("pt-BR").format(VERCEL_PLAN.concurrentExecutions)} execuções`}
                hint={`sobe ${new Intl.NumberFormat("pt-BR").format(VERCEL_PLAN.burstPer10s)} a cada 10 s em pico; Fluid compute reaproveita instâncias`}
              />
              <Fact label="Logs de execução" value={`guardados por ${VERCEL_PLAN.runtimeLogsRetention}`} hint="no Pro: 1 dia" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Cota mensal do Hobby</p>
              <Table>
                <THead>
                  <TR>
                    <TH>Recurso</TH>
                    <TH className="text-right">Incluído</TH>
                  </TR>
                </THead>
                <TBody>
                  <TR>
                    <TD>CPU ativa</TD>
                    <TD className="text-right">{VERCEL_PLAN.monthly.activeCpuHours} h</TD>
                  </TR>
                  <TR>
                    <TD>Execuções de função</TD>
                    <TD className="text-right">1 milhão</TD>
                  </TR>
                  <TR>
                    <TD>Memória provisionada</TD>
                    <TD className="text-right">{VERCEL_PLAN.monthly.provisionedMemoryGbHours} GB-h</TD>
                  </TR>
                  <TR>
                    <TD>Fast Data Transfer (CDN → navegador)</TD>
                    <TD className="text-right">{VERCEL_PLAN.monthly.fastDataTransferGb} GB</TD>
                  </TR>
                  <TR>
                    <TD>Fast Origin Transfer (função → CDN)</TD>
                    <TD className="text-right">{VERCEL_PLAN.monthly.fastOriginTransferGb} GB</TD>
                  </TR>
                  <TR>
                    <TD>Otimização de imagens</TD>
                    <TD className="text-right">5 mil/mês</TD>
                  </TR>
                </TBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                No Hobby a Vercel não expõe o consumo por API: acompanhe no painel.{" "}
                <a href={VERCEL_USAGE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  Abrir Usage da Vercel <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" aria-hidden /> Neon · banco de dados
            </CardTitle>
            <CardDescription>
              Plano {NEON_PLAN.name}. Postgres {dbStats.server?.version ?? ""} compartilhado por produção e previews.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dbStats.size !== null ? (
              <Meter label="Armazenamento" used={dbStats.size} limit={NEON_PLAN.storageBytes} format={formatBytes} hint="Cheio: gravações falham até liberar espaço." />
            ) : null}
            {dbStats.connections ? (
              <Meter
                label="Conexões abertas"
                used={dbStats.connections.total}
                limit={dbStats.connections.max}
                format={(n) => String(Math.round(n))}
                hint={`O pooler aceita até ${new Intl.NumberFormat("pt-BR").format(NEON_PLAN.poolerMaxClients)} clientes e repassa por ${poolSize ?? "—"} conexões reais.`}
              />
            ) : null}
            {neon.status === "ok" ? (
              <>
                <Meter
                  label="Compute no mês"
                  used={neon.cuHours}
                  limit={NEON_PLAN.cuHoursPerMonth}
                  format={(n) => `${nf.format(n)} CU-h`}
                  hint={neonProjection?.cuHours ? `Projeção para o fim do ciclo: ~${nf.format(neonProjection.cuHours)} CU-h. Passou de 100, o banco é suspenso.` : undefined}
                />
                <Meter
                  label="Transferência no mês"
                  used={neon.egressBytes}
                  limit={NEON_PLAN.egressBytesPerMonth}
                  format={formatBytes}
                  hint={neonProjection?.egress ? `Projeção: ~${formatBytes(neonProjection.egress)}.` : undefined}
                />
              </>
            ) : null}
            <div className="divide-y">
              <Fact label="Região do banco" value={runtime.dbRegion ?? "—"} hint={runtime.sameRegion ? "mesma região das funções" : undefined} />
              <Fact
                label="Tamanho do compute"
                value={neon.status === "ok" && neon.minCu !== null ? `${neon.minCu}–${neon.maxCu} CU` : currentCu ? `${currentCu} CU agora` : "—"}
                hint={`até ${NEON_PLAN.maxCu} CU (8 GB RAM) no Free`}
              />
              <Fact
                label="Acordado desde"
                value={dbStats.server ? formatDateTimeBR(dbStats.server.started) : "—"}
                hint={`dorme após ${NEON_PLAN.scaleToZeroMinutes} min sem uso; acordar leva ~0,5 s`}
              />
              <Fact
                label="Imagens dentro do banco"
                value={dbStats.media ? formatBytes(dbStats.media.bytes) : "—"}
                hint={dbStats.media ? `${dbStats.media.files} arquivos (fotos de perfil, banners, fotos de pacientes)` : undefined}
              />
              {neon.status === "ok" ? (
                <Fact
                  label="Ciclo de consumo"
                  value={neon.periodEnd ? `renova em ${formatDateTimeBR(neon.periodEnd)}` : "—"}
                  hint={`${nf.format(neon.activeHours)} h acordado neste ciclo`}
                />
              ) : null}
            </div>
            <a href={NEON_CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
              Abrir console da Neon <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" aria-hidden /> Quantos usuários simultâneos o plano atual suporta
          </CardTitle>
          <CardDescription>
            Tecnicamente, Vercel e Neon aguentam milhares de pessoas ao mesmo tempo. No plano gratuito, o que limita é a cota do mês:
            quanto mais gente usando por mais horas, mais cedo ela acaba.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CapacityCalculator />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crescimento do banco</CardTitle>
            <CardDescription>Quanto cada consultório ocupa e quantos ainda cabem no 1 GB.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Fact label="Consultórios" value={usage?.workspaces ?? "—"} hint={usage ? `${usage.newWorkspaces30d} novos em 30 dias` : undefined} />
            <Fact label="Usuários com login" value={usage?.users ?? "—"} />
            <Fact label="Espaço por consultório (média)" value={bytesPerWorkspace ? formatBytes(bytesPerWorkspace) : "—"} hint="inclui tabelas do sistema; cai conforme a base cresce" />
            <Fact label="Consultórios que ainda cabem" value={workspacesThatFit !== null ? new Intl.NumberFormat("pt-BR").format(workspacesThatFit) : "—"} />
            <Fact
              label="Banco cheio em"
              value={monthsUntilFull !== null ? (monthsUntilFull > 120 ? "mais de 10 anos" : `~${nf.format(monthsUntilFull)} meses`) : "—"}
              hint="no ritmo de cadastros dos últimos 30 dias"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maiores tabelas</CardTitle>
            <CardDescription>Tamanho com índices. Linhas são estimativa do Postgres.</CardDescription>
          </CardHeader>
          <CardContent>
            {dbStats.tables ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Tabela</TH>
                    <TH className="text-right">Linhas</TH>
                    <TH className="text-right">Tamanho</TH>
                  </TR>
                </THead>
                <TBody>
                  {dbStats.tables.map((t) => (
                    <TR key={t.name}>
                      <TD className="font-mono text-xs">{t.name}</TD>
                      <TD className="text-right tabular-nums">{new Intl.NumberFormat("pt-BR").format(t.rows)}</TD>
                      <TD className="text-right tabular-nums">{formatBytes(t.totalBytes)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Indisponível.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que monitorar e quando agir</CardTitle>
          <CardDescription>Limites conferidos em {LIMITS_CHECKED_AT}. Atenção a partir de 70%, crítico a partir de 90%.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Limite</TH>
                <TH>O que acontece ao estourar</TH>
                <TH>Onde ver</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD className="font-medium">CPU ativa (Vercel)</TD>
                <TD>4 h/mês</TD>
                <TD>A Vercel pode pausar o projeto até o ciclo seguinte (Hobby)</TD>
                <TD>Usage da Vercel</TD>
              </TR>
              <TR>
                <TD className="font-medium">Execuções de função (Vercel)</TD>
                <TD>1 milhão/mês</TD>
                <TD>A Vercel pode pausar o projeto (Hobby)</TD>
                <TD>Usage da Vercel</TD>
              </TR>
              <TR>
                <TD className="font-medium">Transferência (Vercel)</TD>
                <TD>100 GB + 10 GB origem</TD>
                <TD>A Vercel pode pausar o projeto (Hobby)</TD>
                <TD>Usage da Vercel</TD>
              </TR>
              <TR>
                <TD className="font-medium">Erros 5xx e lentidão</TD>
                <TD>—</TD>
                <TD>Clientes sem acesso</TD>
                <TD>Observability da Vercel (logs só 1 h no Hobby)</TD>
              </TR>
              <TR>
                <TD className="font-medium">Armazenamento (Neon)</TD>
                <TD>1 GB</TD>
                <TD>Gravações recusadas</TD>
                <TD>Esta tela</TD>
              </TR>
              <TR>
                <TD className="font-medium">Compute (Neon)</TD>
                <TD>100 CU-h/mês</TD>
                <TD>Banco suspenso até o ciclo seguinte</TD>
                <TD>Esta tela (com NEON_API_KEY) ou console da Neon</TD>
              </TR>
              <TR>
                <TD className="font-medium">Transferência (Neon)</TD>
                <TD>5 GB/mês</TD>
                <TD>Banco suspenso até o ciclo seguinte</TD>
                <TD>Esta tela (com NEON_API_KEY) ou console da Neon</TD>
              </TR>
              <TR>
                <TD className="font-medium">Branches (Neon)</TD>
                <TD>10</TD>
                <TD>Não cria branch nova</TD>
                <TD>Console da Neon</TD>
              </TR>
              <TR>
                <TD className="font-medium">Backup / restauração</TD>
                <TD>Histórico curto no Free</TD>
                <TD>Perda de dados sem volta</TD>
                <TD>Console da Neon (Restore)</TD>
              </TR>
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {neon.status !== "ok" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ligar o consumo mensal da Neon</CardTitle>
            <CardDescription>
              {neon.status === "erro" ? `A chave está configurada, mas a Neon respondeu com erro${neon.httpStatus ? ` (${neon.httpStatus})` : ""}. ` : ""}
              Uma vez só, leva 2 minutos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>No console da Neon, abra Account settings → API keys → Create new API key.</li>
              <li>Na Vercel, em Settings → Environment Variables do projeto salutti, crie NEON_API_KEY com essa chave (só Production).</li>
              <li>Faça um novo deploy. NEON_PROJECT_ID já existe, criado pela integração.</li>
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
