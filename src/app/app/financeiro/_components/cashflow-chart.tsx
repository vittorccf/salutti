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

type Point = { label: string; paid: number; expected: number };

export const CashflowChart = ({ data }: { data: Point[] }) => (
  <div className="h-72 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" fontSize={12} />
        <YAxis
          fontSize={12}
          tickFormatter={(v) => `R$ ${Math.round((v as number) / 1000)}k`}
        />
        <Tooltip
          formatter={(v: number) =>
            new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
          }
        />
        <Legend />
        <Bar dataKey="expected" name="Esperado" fill="hsl(var(--muted-foreground))" />
        <Bar dataKey="paid" name="Realizado" fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
