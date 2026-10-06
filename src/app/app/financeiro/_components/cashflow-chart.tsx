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
import { formatBRL } from "@/lib/utils";

type Point = { label: string; paid: number; expected: number };

// Cores e textos vêm dos tokens do DS, então o gráfico acompanha o tema claro/escuro.
const tick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

const compactBRL = (v: number) =>
  v >= 1000 ? `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v / 1000)} mil` : `R$ ${v}`;

export const CashflowChart = ({ data }: { data: Point[] }) => (
  <div className="h-72 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={tick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={72} tickFormatter={(v) => compactBRL(v as number)} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))" }}
          formatter={(v: number) => formatBRL(v)}
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
        <Bar dataKey="expected" name="Previsto" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
        <Bar dataKey="paid" name="Recebido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
