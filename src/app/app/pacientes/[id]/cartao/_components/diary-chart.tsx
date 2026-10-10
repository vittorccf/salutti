"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "@/i18n/client";

type Point = { label: string; mood: number | null; avg: number | null; anxiety: number | null };

const tick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

// Humor do dia (pontos), média móvel de 7 dias (linha forte) e ansiedade (tracejada), na escala 1 a 5.
// Cores dos tokens do DS para acompanhar o tema claro/escuro.
export const DiaryChart = ({ data, showAnxiety }: { data: Point[]; showAnxiety: boolean }) => {
  const t = useTranslations("diary.client.chart");
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -16, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={16} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip
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
          <Line type="monotone" dataKey="mood" name={t("mood")} stroke="hsl(var(--brand))" strokeOpacity={0.35} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="avg" name={t("avg7")} stroke="hsl(var(--brand))" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {showAnxiety ? (
            <Line type="monotone" dataKey="anxiety" name={t("anxiety")} stroke="hsl(var(--warning))" strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
