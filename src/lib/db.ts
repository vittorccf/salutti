import { PrismaClient } from "@prisma/client";
import { decodeJwt } from "jose";

// Acesso de suporte é somente leitura (src/lib/support-access.ts): com a sessão do "Suporte Salutti" no pedido,
// nenhuma gravação passa, venha de Server Action, rota ou componente. Exceções: a própria concessão e a auditoria
// (início e fim do acesso). O token é só lido aqui, sem verificar a assinatura: quem forja um token de suporte
// só bloqueia as próprias gravações, e um token verdadeiro não perde a marca sem invalidar a assinatura.
const WRITE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const ALLOWED_FOR_SUPPORT = new Set(["SupportAccessGrant", "AuditLog"]);

const isSupportRequest = async () => {
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get("salutti_session")?.value;
    return Boolean(token && decodeJwt(token).supportGrantId);
  } catch {
    // Fora de um pedido (seed, scripts, testes): não há sessão.
    return false;
  }
};

const extend = (client: PrismaClient) =>
  client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation) && !ALLOWED_FOR_SUPPORT.has(model) && (await isSupportRequest())) {
            throw new Error("Acesso de suporte: somente leitura.");
          }
          return query(args);
        },
      },
    },
  });

const createClient = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Componentes do navegador às vezes importam, por tabela, um módulo que importa o db (constantes de lib/*).
  // Lá o Prisma não roda e o $extends quebraria a página; o db nunca é usado no navegador.
  return typeof window === "undefined" ? extend(client) : (client as unknown as ReturnType<typeof extend>);
};

// Uma instância por processo (em dev o hot reload recriaria conexões a cada mudança).
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Cliente dentro de db.$transaction(async (tx) => …), com a mesma extensão.
export type DbTransaction = Omit<typeof db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
