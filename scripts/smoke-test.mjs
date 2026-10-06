// Smoke test ponta-a-ponta: cria session JWT manualmente, faz requests autenticados.
// Usa o mesmo AUTH_SECRET do app (lido do .env) e o mesmo padrão de desenvolvimento de src/lib/auth.ts.
// Uso: node scripts/smoke-test.mjs <userId> <workspaceId> [baseUrl]
import { SignJWT } from "jose";

try {
  process.loadEnvFile?.(".env");
} catch {}
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-salutti-prototype");
const BASE = process.argv[4] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const userId = process.argv[2];
const workspaceId = process.argv[3];
if (!userId || !workspaceId) {
  console.error("Uso: node scripts/smoke-test.mjs <userId> <workspaceId> [baseUrl]");
  process.exit(1);
}

const token = await new SignJWT({ userId, email: "test@test", name: "Test" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(SECRET);

const cookie = `salutti_session=${token}; salutti_ws=${workspaceId}`;

const routes = [
  "/app",
  "/app/pacientes",
  "/app/agenda",
  "/app/prontuario",
  "/app/financeiro",
  "/app/fiscal",
  "/app/luma",
  "/app/comunicacao",
  "/app/equipe",
  "/app/lgpd",
  "/app/ajustes",
];

let failed = 0;
for (const route of routes) {
  const res = await fetch(`${BASE}${route}`, {
    headers: { cookie },
    redirect: "manual",
  });
  const ok = res.status === 200;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${route} → ${res.status}`);
}
process.exit(failed > 0 ? 1 : 0);
