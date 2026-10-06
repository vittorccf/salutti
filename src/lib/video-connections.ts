// Em qual conta Google nasce o Meet de uma sessão: sempre na de quem atende (Professional.userId com o Google
// conectado). Nunca na de quem agenda nem numa conta da plataforma: o dono da reunião controla quem entra na
// sala, e o sigilo da sessão é do profissional (Código de Ética, art. 9º).
// Sem o app OAuth da plataforma configurado (desenvolvimento, demonstração), o provider gera link simulado.
import { db } from "./db";
import { decryptSecret } from "./totp";
import { googleOAuthConfigured, GoogleTokenRevokedError } from "./providers/google-oauth";
import { video, type VideoProvider } from "./providers/video";

// Códigos de aviso mostrados na tela da sessão (?aviso=...).
export type MeetIssue = "meet-sem-usuario" | "meet-sem-conexao" | "meet-reconectar" | "video";

export class MeetAccountError extends Error {
  constructor(public issue: MeetIssue) {
    super(issue);
  }
}

async function meetAccountFor(workspaceId: string, professionalId: string, userId: string) {
  const professional = await db.professional.findFirst({
    where: { id: professionalId, workspaceId },
    select: { userId: true, email: true },
  });
  if (!professional) throw new MeetAccountError("meet-sem-usuario");
  // Cadastro antigo sem vínculo: vale só se quem está agendando é o próprio profissional (mesmo e-mail).
  let ownerId = professional.userId;
  if (!ownerId) {
    const me = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (me && professional.email && me.email.toLowerCase() === professional.email.toLowerCase()) ownerId = userId;
  }
  if (!ownerId) throw new MeetAccountError("meet-sem-usuario");
  const conn = await db.integrationConnection.findFirst({
    where: { userId: ownerId, provider: "google", user: { memberships: { some: { workspaceId } } } },
  });
  if (!conn) throw new MeetAccountError("meet-sem-conexao");
  try {
    return { ownerId, connId: conn.id, refreshToken: decryptSecret(conn.refreshToken) };
  } catch {
    throw new MeetAccountError("meet-reconectar");
  }
}

// Cria o link da sessão. Erros esperados viram MeetAccountError com o aviso certo para a tela.
export async function createSessionMeeting(input: {
  workspaceId: string;
  professionalId: string;
  userId: string;
  provider: VideoProvider;
  topic: string;
  startsAt: Date;
  durationMinutes: number;
}) {
  const base = { provider: input.provider, topic: input.topic, startsAt: input.startsAt, durationMinutes: input.durationMinutes };
  if (input.provider !== "google_meet" || !googleOAuthConfigured()) {
    const m = await video.createMeeting(base);
    return { url: m.url, eventId: null, ownerId: null, simulated: m.simulated };
  }
  const account = await meetAccountFor(input.workspaceId, input.professionalId, input.userId);
  try {
    const m = await video.createMeeting({ ...base, googleRefreshToken: account.refreshToken });
    return { url: m.url, eventId: m.externalId, ownerId: account.ownerId, simulated: m.simulated };
  } catch (e) {
    if (e instanceof GoogleTokenRevokedError) {
      // Token vencido ou revogado no Google: a conexão não serve mais; Ajustes passa a pedir para conectar de novo.
      await db.integrationConnection.deleteMany({ where: { id: account.connId } });
      throw new MeetAccountError("meet-reconectar");
    }
    throw e;
  }
}

// Ao cancelar a sessão, o evento sai da agenda de quem atende (falha aqui não impede o cancelamento).
export async function cancelSessionMeeting(appt: { meetingEventId: string | null; meetingOwnerId: string | null }) {
  if (!appt.meetingEventId || !appt.meetingOwnerId || !googleOAuthConfigured()) return;
  const conn = await db.integrationConnection.findUnique({
    where: { userId_provider: { userId: appt.meetingOwnerId, provider: "google" } },
  });
  if (!conn) return;
  try {
    await video.deleteGoogleEvent(decryptSecret(conn.refreshToken), appt.meetingEventId);
  } catch (e) {
    console.error("[video] falha ao apagar evento do Google", e);
  }
}

// Texto de cada aviso: chave em schedule.meetIssues (a tela da sessão traduz pelo código do ?aviso=).
export const MEET_ISSUE_KEY: Record<MeetIssue, "noUser" | "noConnection" | "reconnect" | "video"> = {
  "meet-sem-usuario": "noUser",
  "meet-sem-conexao": "noConnection",
  "meet-reconectar": "reconnect",
  video: "video",
};

export const isMeetIssue = (v: unknown): v is MeetIssue => typeof v === "string" && Object.hasOwn(MEET_ISSUE_KEY, v);
