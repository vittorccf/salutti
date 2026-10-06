import { defineConfig, devices } from "@playwright/test";

// Ponta a ponta num Postgres próprio (embutido e descartável localmente; serviço no CI), recriado
// a cada execução por scripts/e2e-server.mjs, e num servidor próprio na porta 3300.
const PORT = 3300;
const env = {
  NEXT_DIST_DIR: ".next-e2e",
  AUTH_SECRET: "e2e-secret-only-for-tests-0123456789abcdef",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // No CI testa o build de produção; localmente, o dev server.
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/login`,
    env,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
