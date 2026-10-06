// npm run db:local — sobe um Postgres local em localhost:5433 (dados em .pgdata) e aplica as migrations.
// Na primeira vez, rode também `npm run db:seed`. Ctrl+C para parar.
import { execSync } from "node:child_process";
import path from "node:path";
import { startEmbeddedPostgres } from "./pg-embedded.mjs";

const { pg, url } = await startEmbeddedPostgres({ dir: path.resolve(".pgdata"), port: 5433, database: "salutti" });
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
console.log(`\nPostgres pronto: ${url}\nCtrl+C para parar.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
