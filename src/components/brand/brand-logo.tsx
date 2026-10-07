import { cn } from "@/lib/utils";
import { AREAS, type Area } from "@/lib/areas";

type Props = {
  /** logo = símbolo + nome (login, banner/topo); symbol = só os balões (lugares pequenos, onde o logo fica grande) */
  variant?: "logo" | "symbol";
  /** altura em px; a largura acompanha a proporção do arquivo */
  height?: number;
  className?: string;
  /** área da marca: na Salutti Estética o logo traz o selo "estética" e o símbolo vai em orquídea → pêssego.
   *  Com selo, use pelo menos 32 px de altura (abaixo disso o selo não lê). */
  area?: Area;
};

// Arquivos oficiais do logo Diálogo em public/brand: a versão colorida no tema claro e a branca no escuro. As duas
// imagens vão na página e o tema mostra uma (sem piscar na troca de tema). Na Salutti Estética, os arquivos do
// design system "Salutti Estética" já trazem o selo "estética" (Cormorant em curvas, num retângulo lilás).
const FILES: Record<Area, Record<"logo" | "symbol", { light: string; dark: string; ratio: number }>> = {
  mental: {
    logo: { light: "/brand/salutti-logo.svg", dark: "/brand/salutti-logo-branco.svg", ratio: 3914 / 900 },
    symbol: { light: "/brand/salutti-simbolo.svg", dark: "/brand/salutti-simbolo-branco.svg", ratio: 1 },
  },
  estetica: {
    logo: { light: "/brand/estetica/salutti-estetica-logo.svg", dark: "/brand/estetica/salutti-estetica-logo-branco.svg", ratio: 368.9 / 64 },
    symbol: { light: "/brand/estetica/salutti-estetica-simbolo.svg", dark: "/brand/estetica/salutti-estetica-simbolo-branco.svg", ratio: 1 },
  },
};

export function BrandLogo({ variant = "logo", height = 28, className, area = "mental" }: Props) {
  const f = FILES[area][variant];
  const width = Math.round(height * f.ratio);
  return (
    <span role="img" aria-label={variant === "logo" ? AREAS[area].name : "Salutti"} className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca, sem otimização necessária */}
      <img src={f.light} alt="" width={width} height={height} className="block dark:hidden" style={{ height, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem, versão branca para o tema escuro */}
      <img src={f.dark} alt="" width={width} height={height} className="hidden dark:block" style={{ height, width: "auto" }} />
    </span>
  );
}
