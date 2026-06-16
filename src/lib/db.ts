import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// MODO DEMO (Vercel): o filesystem serverless é somente-leitura, exceto /tmp.
// Copiamos o banco SQLite empacotado (prisma/seed.db) para /tmp a cada cold
// start e apontamos o Prisma para lá. Escritas funcionam, mas NÃO persistem
// entre instâncias - os dados resetam para o seed periodicamente.
function resolveDemoDatasourceUrl(): string | undefined {
  if (!process.env.VERCEL) return undefined; // local: usa DATABASE_URL do .env
  const tmpDb = "/tmp/app.db";
  try {
    if (!fs.existsSync(tmpDb)) {
      const bundled = path.join(process.cwd(), "prisma", "seed.db");
      if (!fs.existsSync(bundled)) return undefined; // sem demo: cai no env
      fs.copyFileSync(bundled, tmpDb);
    }
    return `file:${tmpDb}`;
  } catch {
    return undefined;
  }
}

const demoUrl = resolveDemoDatasourceUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(demoUrl ? { datasources: { db: { url: demoUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
