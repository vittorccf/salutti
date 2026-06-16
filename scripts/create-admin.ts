/* eslint-disable no-console */
// Cria (ou atualiza) um usuário administrador idempotente, sem apagar os dados existentes.
// Login: usuário "admin" / senha "admin".
// Uso: npm run db:admin
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const USERNAME = "admin";
const PASSWORD = "admin";

async function main() {
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);

  const user = await db.user.upsert({
    where: { email: USERNAME },
    update: { passwordHash, name: "Administrador" },
    create: { email: USERNAME, name: "Administrador", passwordHash },
  });

  const workspace = await db.workspace.upsert({
    where: { slug: "salutti-admin" },
    update: {},
    create: {
      name: "Administração Salutti",
      slug: "salutti-admin",
      segment: "clinica",
      planTier: "enterprise",
    },
  });

  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "admin" },
    create: { userId: user.id, workspaceId: workspace.id, role: "admin" },
  });

  console.log(`✅ Admin pronto → usuário: ${USERNAME} · senha: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
