// Provider de videochamada: Google Meet (via Google Agenda) e Zoom.
// Sem credenciais, gera um link simulado da Salutti (modo sandbox), sem imitar um link real.
//
// Google Meet: app OAuth com escopo calendar.events e um refresh token da conta do consultório.
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID (padrão "primary")
// Zoom: app "Server-to-Server OAuth" com escopo meeting:write.
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
import { TZ } from "../dates";

export type VideoProvider = "google_meet" | "zoom";

export type MeetingInput = {
  provider: VideoProvider;
  topic: string;
  startsAt: Date;
  durationMinutes: number;
};

export type Meeting = { url: string; externalId: string; simulated: boolean };

const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
const zoomConfigured = () =>
  Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);

export const videoStatus = {
  google_meet: () => (googleConfigured() ? "real" : "sandbox"),
  zoom: () => (zoomConfigured() ? "real" : "sandbox"),
} as const;

const simulated = (provider: VideoProvider): Meeting => {
  const id = Math.random().toString(36).slice(2, 10);
  return { url: `https://meet.salutti.app/sessao/${id}?via=${provider}`, externalId: `sim_${id}`, simulated: true };
};

async function createGoogleMeet({ topic, startsAt, durationMinutes }: MeetingInput): Promise<Meeting> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google OAuth: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const eventRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        summary: topic,
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

async function createZoom({ topic, startsAt, durationMinutes }: MeetingInput): Promise<Meeting> {
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`,
    { method: "POST", headers: { authorization: `Basic ${basic}` } },
  );
  if (!tokenRes.ok) throw new Error(`Zoom OAuth: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      topic,
      type: 2, // reunião agendada
      start_time: startsAt.toISOString(),
      duration: durationMinutes,
      timezone: TZ,
      settings: { waiting_room: true, join_before_host: false },
    }),
  });
  if (!meetingRes.ok) throw new Error(`Zoom: ${meetingRes.status}`);
  const meeting = (await meetingRes.json()) as { id: number; join_url: string };
  return { url: meeting.join_url, externalId: String(meeting.id), simulated: false };
}

export const video = {
  async createMeeting(input: MeetingInput): Promise<Meeting> {
    if (input.provider === "google_meet") return googleConfigured() ? createGoogleMeet(input) : simulated("google_meet");
    return zoomConfigured() ? createZoom(input) : simulated("zoom");
  },
};

// Nome da plataforma a partir do link salvo na sessão (não há coluna própria no banco).
export const meetingPlatform = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.includes("meet.google.com") || url.includes("via=google_meet")) return "Google Meet";
  if (url.includes("zoom.us") || url.includes("via=zoom")) return "Zoom";
  return "Videochamada";
};

export const isSimulatedMeeting = (url: string | null | undefined) => Boolean(url?.startsWith("https://meet.salutti.app/"));
