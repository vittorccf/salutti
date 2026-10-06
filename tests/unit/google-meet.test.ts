import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authUrl, CALENDAR_SCOPE, exchangeCode, GoogleScopeError, newPkce } from "@/lib/providers/google-oauth";
import { video } from "@/lib/providers/video";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("conexão do Google por usuário", () => {
  it("monta a autorização com PKCE, offline e o escopo do Agenda", () => {
    const { challenge, state, verifier } = newPkce();
    expect(verifier).not.toBe(challenge);
    const url = new URL(authUrl({ redirectUri: "https://salutti.app/api/integracoes/google/retorno", state, challenge, loginHint: "ana@x.com" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toContain(CALENDAR_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("login_hint")).toBe("ana@x.com");
  });

  it("troca o código, lê o e-mail e recusa (revogando) quando o Agenda foi desmarcado", async () => {
    const f = vi.fn().mockResolvedValueOnce(
      json({ refresh_token: "rt", access_token: "at", scope: `openid email ${CALENDAR_SCOPE}`, id_token: idToken("ana@gmail.com") }),
    );
    vi.stubGlobal("fetch", f);
    expect(await exchangeCode({ code: "c", redirectUri: "r", verifier: "v" })).toMatchObject({ refreshToken: "rt", email: "ana@gmail.com" });
    expect(String(f.mock.calls[0][1].body)).toContain("code_verifier=v");

    const g = vi.fn().mockResolvedValueOnce(json({ refresh_token: "rt", access_token: "at", scope: "openid email" })).mockResolvedValue(new Response(""));
    vi.stubGlobal("fetch", g);
    await expect(exchangeCode({ code: "c", redirectUri: "r", verifier: "v" })).rejects.toBeInstanceOf(GoogleScopeError);
    expect(String(g.mock.calls[1][0])).toContain("oauth2.googleapis.com/revoke");
  });

  it("cria o Meet na agenda da conta conectada; sem conta, link simulado", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ access_token: "at" }))
      .mockResolvedValueOnce(json({ id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" }));
    vi.stubGlobal("fetch", f);
    const input = { provider: "google_meet" as const, topic: "Sessão · Salutti", startsAt: new Date("2026-11-10T18:00:00Z"), durationMinutes: 50 };
    expect(await video.createMeeting({ ...input, googleRefreshToken: "rt-da-ana" })).toEqual({
      url: "https://meet.google.com/abc-defg-hij",
      externalId: "ev1",
      simulated: false,
    });
    expect(String(f.mock.calls[0][1].body)).toContain("refresh_token=rt-da-ana");
    expect(String(f.mock.calls[1][0])).toContain("/calendars/primary/events");
    // O nome do paciente não vai para o Google: título genérico e sem convidados.
    const event = JSON.parse(f.mock.calls[1][1].body);
    expect(event.summary).toBe("Sessão · Salutti");
    expect(event.attendees).toBeUndefined();
    // Agenda compartilhada não mostra o compromisso.
    expect(event.visibility).toBe("private");

    expect((await video.createMeeting(input)).simulated).toBe(true);
  });
});
