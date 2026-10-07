import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleTokenRevokedError } from "@/lib/providers/google-oauth";
import { isSimulatedMeeting, meetingPlatform, video, videoStatus } from "@/lib/providers/video";

const KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const input = { topic: "Sessão · Salutti", startsAt: new Date("2026-10-20T18:00:00Z"), durationMinutes: 50 };

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("videochamada", () => {
  it("sem chaves gera link simulado identificável", async () => {
    expect(videoStatus.google_meet()).toBe("sandbox");
    const meet = await video.createMeeting({ provider: "google_meet", ...input, googleRefreshToken: "z" });
    expect(meet.simulated).toBe(true);
    expect(isSimulatedMeeting(meet.url)).toBe(true);
    expect(meetingPlatform(meet.url)).toBe("Google Meet");
  });

  it("reconhece links reais", () => {
    expect(meetingPlatform("https://meet.google.com/abc-defg-hij")).toBe("Google Meet");
    // Link de outra plataforma (salvo à mão ou de antes): nome genérico.
    expect(meetingPlatform("https://us02web.zoom.us/j/123")).toBe("Videochamada");
    expect(isSimulatedMeeting("https://meet.google.com/abc-defg-hij")).toBe(false);
    expect(meetingPlatform(null)).toBeNull();
  });

  it("Google com chaves cria evento com Meet e lê o hangoutLink", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "tok" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "evt1", hangoutLink: "https://meet.google.com/abc-defg-hij" })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await video.createMeeting({ provider: "google_meet", ...input, googleRefreshToken: "z" });
    expect(m.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(String(fetchMock.mock.calls[1][0])).toContain("conferenceDataVersion=1");
  });

  it("erro da API vira exceção (a tela mostra o aviso)", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(video.createMeeting({ provider: "google_meet", ...input, googleRefreshToken: "z" })).rejects.toThrow("Google OAuth: 401");
  });

  it("token vencido ou revogado no Google vira GoogleTokenRevokedError", async () => {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));
    await expect(video.createMeeting({ provider: "google_meet", ...input, googleRefreshToken: "z" })).rejects.toBeInstanceOf(
      GoogleTokenRevokedError,
    );
  });
});
