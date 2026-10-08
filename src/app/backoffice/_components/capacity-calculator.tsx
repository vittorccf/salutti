"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bottleneck,
  capacityLimits,
  DEFAULT_CAPACITY_INPUT,
  formatUsers,
  pagesPerUserMonth,
  type CapacityInput,
} from "@/lib/backoffice/capacity";
import { cn } from "@/lib/utils";

const FIELDS: { key: keyof CapacityInput; label: string; step: number; min: number }[] = [
  { key: "hoursPerDay", label: "Horas de uso por dia", step: 1, min: 1 },
  { key: "daysPerMonth", label: "Dias de uso no mês", step: 1, min: 1 },
  { key: "secondsBetweenPages", label: "Segundos entre telas (por pessoa)", step: 5, min: 1 },
  { key: "invocationsPerPage", label: "Execuções de função por tela", step: 0.5, min: 0.1 },
  { key: "cpuMsPerPage", label: "CPU por tela na Vercel (ms)", step: 5, min: 1 },
  { key: "originKbPerPage", label: "KB da função por tela", step: 5, min: 1 },
  { key: "transferKbPerPage", label: "KB para o navegador por tela", step: 10, min: 1 },
  { key: "dbKbPerPage", label: "KB do banco por tela", step: 1, min: 1 },
  { key: "averageCu", label: "Tamanho médio do banco (CU)", step: 0.25, min: 0.25 },
];

export function CapacityCalculator({ initial }: { initial?: Partial<CapacityInput> }) {
  const [input, setInput] = useState<CapacityInput>({ ...DEFAULT_CAPACITY_INPUT, ...initial });
  const limits = useMemo(() => capacityLimits(input), [input]);
  const worst = bottleneck(limits);
  const sorted = [...limits].sort((a, b) => a.maxConcurrentUsers - b.maxConcurrentUsers);
  const pagesPerUser = pagesPerUserMonth(input);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <div className="rounded-lg border bg-accent/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cabem no plano atual, usando o mês inteiro</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums" data-testid="capacity-users">
            {formatUsers(worst.maxConcurrentUsers)}
          </p>
          <p className="text-sm text-muted-foreground">
            usuários simultâneos durante {input.hoursPerDay} h/dia, {input.daysPerMonth} dias
          </p>
          <p className="mt-2 text-sm">
            Primeiro limite a estourar: <strong>{worst.label}</strong>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`cap-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={`cap-${f.key}`}
                type="number"
                inputMode="decimal"
                min={f.min}
                step={f.step}
                value={input[f.key]}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value >= f.min) setInput((prev) => ({ ...prev, [f.key]: value }));
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setInput({ ...DEFAULT_CAPACITY_INPUT, ...initial })}
        >
          Voltar aos valores padrão
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Cada pessoa gera cerca de {formatUsers(pagesPerUser)} telas por mês nesse ritmo. Usuários simultâneos que cada cota aguenta:
        </p>
        <ul className="divide-y rounded-lg border">
          {sorted.map((l) => (
            <li key={l.key} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", l.key === worst.key && "bg-warning/[.08]")}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.detail}</span>
              </span>
              <span className={cn("tabular-nums font-semibold", l.maxConcurrentUsers === 0 && "text-destructive-strong")}>
                {l.key === "cu" ? (l.maxConcurrentUsers === 0 ? "estoura" : "cabe") : formatUsers(l.maxConcurrentUsers)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Estimativa, não medição. Os valores por tela são hipóteses: confira o consumo real no painel da Vercel (Usage) e ajuste
          aqui. &quot;Simultâneos&quot; = pessoas usando ao mesmo tempo durante todo o horário informado; picos curtos acima disso
          não são problema, o que conta é o total do mês.
        </p>
      </div>
    </div>
  );
}
