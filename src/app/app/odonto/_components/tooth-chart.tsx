import Link from "next/link";
import { DECIDUOUS_ROWS, FACES, PERMANENT_ROWS, TOOTH_STATUSES, type ToothStatus } from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";

// Odontograma por quadrantes (visão do dentista, de frente para o paciente), com a linha média e o plano oclusal.
// Cada dente é um link (?dente=NN) com nome acessível "Dente 16: A tratar"; a legenda mostra só os status presentes.
export async function ToothChart({
  teeth,
  dentition = "permanente",
  selected,
  hrefFor,
}: {
  teeth: Record<number, ToothStatus>;
  dentition?: "permanente" | "decidua";
  selected?: number | null;
  hrefFor?: (tooth: number) => string;
}) {
  const t = await getTranslations("odonto.chart");
  const rows = dentition === "decidua" ? DECIDUOUS_ROWS : PERMANENT_ROWS;
  const used = TOOTH_STATUSES.filter((s) => s === "higido" || Object.values(teeth).includes(s));
  const cell = (n: number) => {
    const st = teeth[n] ?? "higido";
    const label = t("toothLabel", { tooth: n, status: t(`status.${st}`) });
    const cls = `tooth-cell tooth-cell--${st}`;
    return hrefFor ? (
      <Link key={n} href={hrefFor(n)} scroll={false} className={`${cls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} aria-label={label} aria-current={selected === n ? "true" : undefined}>
        {n}
      </Link>
    ) : (
      <span key={n} className={cls} role="img" aria-label={label}>
        <span aria-hidden>{n}</span>
      </span>
    );
  };
  return (
    <figure className="m-0 grid max-w-full justify-items-center gap-1.5 overflow-x-auto pb-1" aria-label={t("title")}>
      {rows.map((row, r) => (
        <div key={r} className="contents">
          {r === 1 ? <div className="h-px w-full bg-border" aria-hidden /> : null}
          <div className="flex items-center gap-3">
            <div className="flex gap-1">{row[0].map(cell)}</div>
            <div className="w-px self-stretch bg-border" aria-hidden />
            <div className="flex gap-1">{row[1].map(cell)}</div>
          </div>
        </div>
      ))}
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground">
        {used.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`tooth-cell tooth-cell--${s} !h-3.5 !w-3.5 !rounded`} aria-hidden />
            {t(`status.${s}`)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// Faces do dente em caixas de seleção (M, O/I, D, V, L/P), na ordem clínica.
export async function FacesField({ name = "faces", selected = "", idPrefix }: { name?: string; selected?: string | null; idPrefix: string }) {
  const t = await getTranslations("odonto.faces");
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t("label")}</legend>
      <div className="flex flex-wrap gap-2">
        {FACES.map((f) => (
          <label key={f} htmlFor={`${idPrefix}-${f}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-accent">
            <input id={`${idPrefix}-${f}`} type="checkbox" name={name} value={f} defaultChecked={!!selected?.includes(f)} className="h-4 w-4 accent-primary" />
            <span className="font-tooth">{f}</span>
            <span className="sr-only">{t(`names.${f}`)}</span>
            <span aria-hidden className="text-xs text-muted-foreground">
              {t(`short.${f}`)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Dente FDI com faces ("16 · MOD"), em Geist Mono, para tabelas e orçamento.
export function ToothTag({ tooth, faces }: { tooth: number | null; faces?: string | null }) {
  if (!tooth) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="font-tooth inline-flex h-6 items-center rounded-md border px-2 text-[13px]" title={faces ? `${tooth} ${faces}` : String(tooth)}>
      {tooth}
      {faces ? ` · ${faces}` : ""}
    </span>
  );
}
