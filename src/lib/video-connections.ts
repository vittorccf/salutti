// Qual conta do Google cria o Meet de uma sessão: a do profissional que atende (usuário do consultório com o
// mesmo e-mail do cadastro profissional e Google conectado); senão, a de quem está agendando. Sem nenhuma,
// o provider usa a conta da plataforma (se configurada) ou o link simulado.
import { db } from "./db";
import { decryptSecret } from "./totp";

export async function googleRefreshTokenFor({
  workspaceId,
  professionalId,
  userId,
}: {
  workspaceId: string;
  professionalId?: string | null;
  userId: string;
}): Promise<string | null> {
  const professional = professionalId
    ? await db.professional.findFirst({ where: { id: professionalId, workspaceId }, select: { email: true } })
    : null;
  const candidates = await db.integrationConnection.findMany({
    where: {
      provider: "google",
      user: {
        memberships: { some: { workspaceId } },
        OR: [{ id: userId }, ...(professional?.email ? [{ email: { equals: professional.email, mode: "insensitive" as const } }] : [])],
      },
    },
    include: { user: { select: { id: true, email: true } } },
  });
  const ofProfessional = candidates.find((c) => professional?.email && c.user.email.toLowerCase() === professional.email.toLowerCase());
  const chosen = ofProfessional ?? candidates.find((c) => c.user.id === userId);
  return chosen ? decryptSecret(chosen.refreshToken) : null;
}
