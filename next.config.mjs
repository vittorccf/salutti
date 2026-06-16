/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    // Garante que o banco demo seja empacotado nas funções serverless do Vercel.
    outputFileTracingIncludes: {
      "/**": ["./prisma/seed.db"],
    },
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
