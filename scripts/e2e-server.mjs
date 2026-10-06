// Servidor dos testes ponta a ponta (chamado pelo Playwright).
// Sem DATABASE_URL (local): sobe um Postgres embutido descartável. No CI, usa o Postgres do serviço.
// Em ambos: recria o banco (migrations + seed com usuários de demonstração) e inicia o Next na porta 3300.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEmbeddedPostgres } from "./pg-embedded.mjs";

const PORT = 3300;
let pg = null;
let url = process.env.E2E_DATABASE_URL;

if (!url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salutti-e2e-pg-"));
  ({ pg, url } = await startEmbeddedPostgres({ dir, port: 5434, database: "salutti_e2e", persistent: false }));
}

const env = { ...process.env, DATABASE_URL: url };
// SEED_DEMO=1: o seed cria os usuários de demonstração (guilherme, kris) usados pelos testes.
execSync("npx prisma migrate reset --force --skip-generate", { stdio: "inherit", env: { ...env, SEED_DEMO: "1" } });

const command = process.env.CI ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`;
const next = spawn(command, { stdio: "inherit", shell: true, env });

const stop = async () => {
  next.kill();
  if (pg) await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", async (code) => {
  if (pg) await pg.stop();
  process.exit(code ?? 0);
});
