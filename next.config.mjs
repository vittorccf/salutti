/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite builds de verificação em outro diretório sem afetar o dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // O assistente LUMA virou TOBI: links antigos continuam funcionando.
  async redirects() {
    return [{ source: "/app/luma", destination: "/app/tobi", permanent: true }];
  },
};

export default nextConfig;
