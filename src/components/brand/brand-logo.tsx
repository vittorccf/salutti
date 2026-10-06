import { cn } from "@/lib/utils";

type Props = {
  /** logo = símbolo + nome (login, banner/topo); symbol = só os balões (lugares pequenos, onde o logo fica grande) */
  variant?: "logo" | "symbol";
  /** altura em px; a largura acompanha a proporção do arquivo */
  height?: number;
  className?: string;
};

// Arquivos oficiais do logo Diálogo (design system Salutti 2.0) em public/brand: a versão colorida no tema claro
// e a branca no tema escuro. As duas imagens vão na página e o tema mostra uma (sem piscar na troca de tema).
const FILES = {
  logo: { light: "/brand/salutti-logo.svg", dark: "/brand/salutti-logo-branco.svg", ratio: 3914 / 900 },
  symbol: { light: "/brand/salutti-simbolo.svg", dark: "/brand/salutti-simbolo-branco.svg", ratio: 1 },
};

export function BrandLogo({ variant = "logo", height = 28, className }: Props) {
  const f = FILES[variant];
  const width = Math.round(height * f.ratio);
  return (
    <span role="img" aria-label="Salutti" className={cn("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca, sem otimização necessária */}
      <img src={f.light} alt="" width={width} height={height} className="block dark:hidden" style={{ height, width: "auto" }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- idem, versão branca para o tema escuro */}
      <img src={f.dark} alt="" width={width} height={height} className="hidden dark:block" style={{ height, width: "auto" }} />
    </span>
  );
}
