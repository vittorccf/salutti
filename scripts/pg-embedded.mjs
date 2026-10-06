// Postgres embutido (binários oficiais via npm), para desenvolvimento e testes sem Docker.
import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export async function startEmbeddedPostgres({ dir, port, database, persistent = true }) {
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent,
    onLog: () => {},
  });
  if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    // banco já existe
  }
  return { pg, url: `postgresql://postgres:postgres@localhost:${port}/${database}` };
}
