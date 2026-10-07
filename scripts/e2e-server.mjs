// Servidor dos testes ponta a ponta (chamado pelo Playwright).
// Sem DATABASE_URL (local): sobe um Postgres embutido descartável. No CI, usa o Postgres do serviço.
// Em ambos: recria o banco (migrations + seed com usuários de demonstração) e inicia o Next na porta 3300.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { startEmbeddedPostgres } from "./pg-embedded.mjs";

const E2E_BACKOFFICE_PASSWORD = "senha-inicial-e2e";

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
// A senha inicial do admin do backoffice (migration) não fica no repositório: no banco descartável dos testes
// ela vira uma senha conhecida só pelos testes (tests/e2e/backoffice.spec.ts).
const e2eHash = bcrypt.hashSync(E2E_BACKOFFICE_PASSWORD, 10);
execSync("npx prisma db execute --stdin --schema prisma/schema.prisma", {
  input: `UPDATE "BackofficeUser" SET "passwordHash" = '${e2eHash}' WHERE "username" = 'admin';`,
  stdio: ["pipe", "inherit", "inherit"],
  env,
});

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
