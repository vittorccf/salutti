import type { MetadataRoute } from "next";

// App instalável (Chrome/Edge "Instalar app", atalho no celular): nome e ícones com o ícone do Salutti 2.0 (salutti-icone.svg).
// Sem manifest, o navegador guardava o favicon do momento da instalação e não atualizava mais o ícone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salutti",
    short_name: "Salutti",
    description: "Gestão para profissionais de saúde mental.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f5f5fc",
    theme_color: "#f5f5fc",
    lang: "pt-BR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/salutti-icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
