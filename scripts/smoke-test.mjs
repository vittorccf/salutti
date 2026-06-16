// Smoke test ponta-a-ponta: cria session JWT manualmente, faz requests autenticados.
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode("dev-secret-please-change-in-production-saluti-prototype-001");
const BASE = "http://localhost:3030";

const userId = process.argv[2];
const workspaceId = process.argv[3];
if (!userId || !workspaceId) {
  console.error("Uso: node smoke-test.mjs <userId> <workspaceId>");
  process.exit(1);
}

const token = await new SignJWT({ userId, email: "test@test", name: "Test" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(SECRET);

const cookie = `saluti_session=${token}; saluti_ws=${workspaceId}`;

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
