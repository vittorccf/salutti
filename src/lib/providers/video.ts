// Provider de videochamada: Google Meet (via Google Agenda).
// Sem credenciais, gera um link simulado da Salutti (modo sandbox), sem imitar um link real.
//
// Google Meet: app OAuth da plataforma (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) e a conta Google que cada
//   usuário conecta em Ajustes (src/lib/providers/google-oauth.ts). O Meet nasce na agenda principal de quem
//   atende (a escolha da conta fica em src/lib/video-connections.ts).
import { TZ } from "../dates";
import { accessTokenFrom, googleOAuthConfigured } from "./google-oauth";

export type VideoProvider = "google_meet";

export type MeetingInput = {
  provider: VideoProvider;
  topic: string;
  startsAt: Date;
  durationMinutes: number;
  // Refresh token da conta Google conectada pelo profissional (ou por quem agenda), já decifrado.
  googleRefreshToken?: string | null;
};

export type Meeting = { url: string; externalId: string; simulated: boolean };

export const videoStatus = {
  google_meet: () => (googleOAuthConfigured() ? "real" : "sandbox"),
} as const;

const simulated = (provider: VideoProvider): Meeting => {
  const id = Math.random().toString(36).slice(2, 10);
  return { url: `https://meet.salutti.app/sessao/${id}?via=${provider}`, externalId: `sim_${id}`, simulated: true };
};

async function createGoogleMeet({ topic, startsAt, durationMinutes }: MeetingInput, refreshToken: string): Promise<Meeting> {
  const access_token = await accessTokenFrom(refreshToken);
  const calendarId = "primary";
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const eventRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        summary: topic,
        // Agenda compartilhada com família ou equipe não mostra o compromisso; o horário fica ocupado.
        visibility: "private",
        transparency: "opaque",
        start: { dateTime: startsAt.toISOString(), timeZone: TZ },
        end: { dateTime: endsAt.toISOString(), timeZone: TZ },
        conferenceData: {
          createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }),
    },
  );
  if (!eventRes.ok) throw new Error(`Google Agenda: ${eventRes.status}`);
  const event = (await eventRes.json()) as {
    id: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  };
  const url = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  if (!url) throw new Error("Google Agenda não retornou o link do Meet");
  return { url, externalId: event.id, simulated: false };
}

export const video = {
  deleteGoogleEvent,
  async createMeeting(input: MeetingInput): Promise<Meeting> {
    return googleOAuthConfigured() && input.googleRefreshToken
      ? createGoogleMeet(input, input.googleRefreshToken)
      : simulated(input.provider);
  },
};

// Apaga o evento (e com ele o Meet) da agenda de quem atende.
export async function deleteGoogleEvent(refreshToken: string, eventId: string) {
  const access_token = await accessTokenFrom(refreshToken);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", headers: { authorization: `Bearer ${access_token}` } },
  );
  // 404/410: o evento já não existe (apagado na agenda); tudo certo.
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Agenda: ${res.status}`);
}

// Nome da plataforma a partir do link salvo na sessão (não há coluna própria no banco).
export const meetingPlatform = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.includes("meet.google.com") || url.includes("via=google_meet")) return "Google Meet";
  return "Videochamada";
};

export const isSimulatedMeeting = (url: string | null | undefined) => Boolean(url?.startsWith("https://meet.salutti.app/"));
