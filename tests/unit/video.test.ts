import { afterEach, describe, expect, it, vi } from "vitest";
import { isSimulatedMeeting, meetingPlatform, video, videoStatus } from "@/lib/providers/video";

const KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"];
const input = { topic: "Sessão · Salutti", startsAt: new Date("2026-10-20T18:00:00Z"), durationMinutes: 50 };

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("videochamada", () => {
  it("sem chaves gera link simulado identificável", async () => {
    expect(videoStatus.google_meet()).toBe("sandbox");
    const meet = await video.createMeeting({ provider: "google_meet", ...input });
    expect(meet.simulated).toBe(true);
    expect(isSimulatedMeeting(meet.url)).toBe(true);
    expect(meetingPlatform(meet.url)).toBe("Google Meet");
    const zoom = await video.createMeeting({ provider: "zoom", ...input });
    expect(meetingPlatform(zoom.url)).toBe("Zoom");
  });

  it("reconhece links reais", () => {
    expect(meetingPlatform("https://meet.google.com/abc-defg-hij")).toBe("Google Meet");
    expect(meetingPlatform("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(isSimulatedMeeting("https://us02web.zoom.us/j/123")).toBe(false);
    expect(meetingPlatform(null)).toBeNull();
  });

  it("Zoom com chaves chama a API e devolve o join_url", async () => {
    Object.assign(process.env, { ZOOM_ACCOUNT_ID: "a", ZOOM_CLIENT_ID: "b", ZOOM_CLIENT_SECRET: "c" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 987, join_url: "https://zoom.us/j/987" })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await video.createMeeting({ provider: "zoom", ...input });
    expect(m).toEqual({ url: "https://zoom.us/j/987", externalId: "987", simulated: false });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ topic: "Sessão · Salutti", type: 2, duration: 50, timezone: "America/Sao_Paulo" });
  });

  it("Google com chaves cria evento com Meet e lê o hangoutLink", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", GOOGLE_REFRESH_TOKEN: "z" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "evt1", hangoutLink: "https://meet.google.com/abc-defg-hij" })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await video.createMeeting({ provider: "google_meet", ...input });
    expect(m.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(String(fetchMock.mock.calls[1][0])).toContain("conferenceDataVersion=1");
  });

  it("erro da API vira exceção (a tela mostra o aviso)", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", GOOGLE_REFRESH_TOKEN: "z" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(video.createMeeting({ provider: "google_meet", ...input })).rejects.toThrow("Google OAuth: 401");
  });
});
