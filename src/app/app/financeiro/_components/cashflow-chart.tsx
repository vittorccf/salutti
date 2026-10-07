"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat, useTranslations } from "@/i18n/client";

type Point = { label: string; paid: number; expected: number };

// Cores e textos vêm dos tokens do DS, então o gráfico acompanha o tema claro/escuro.
// Série principal (recebido) em brand; previsto em brand-slate (no tema Noite brand já é o azul névoa).
const tick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

// Eixo Y compacto no idioma da interface: "R$ 1,5 mil", "R$1.5K".
const compactBRL = (locale: string, v: number) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);

export const CashflowChart = ({ data }: { data: Point[] }) => {
  const t = useTranslations("finance.chart");
  const f = useFormat();
  return (
  <div className="h-72 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={tick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={72} tickFormatter={(v) => compactBRL(f.locale, v as number)} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(v: number) => f.money(v)}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            color: "hsl(var(--popover-foreground))",
            fontSize: 13,
          }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
        <Bar dataKey="expected" name={t("expected")} fill="hsl(var(--brand-slate))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="paid" name={t("paid")} fill="hsl(var(--brand))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
  );
};
