/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite builds de verificação em outro diretório sem afetar o dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
