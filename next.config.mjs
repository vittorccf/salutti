import createNextIntlPlugin from "next-intl/plugin";
import { computeAppVersion } from "./scripts/app-version.mjs";

// Idiomas sem prefixo na URL: o next-intl lê a configuração por requisição em src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const { version, commit } = computeAppVersion();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Versão exibida no app e no backoffice (src/lib/version.ts).
  env: { NEXT_PUBLIC_APP_VERSION: version, NEXT_PUBLIC_APP_COMMIT: commit },
  // Permite builds de verificação em outro diretório sem afetar o dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // O assistente se chamou LUMA e depois TOBI; hoje é Saluttin. Links antigos continuam funcionando.
  async redirects() {
    return [
      { source: "/app/luma", destination: "/app/saluttin", permanent: true },
      { source: "/app/tobi", destination: "/app/saluttin", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
