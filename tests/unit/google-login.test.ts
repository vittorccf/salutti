import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeLoginCode, identityFromIdToken, loginAuthUrl } from "@/lib/providers/google-login";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const idToken = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Entrar com Google", () => {
  it("pede só a identidade, com PKCE e escolha de conta", () => {
    const url = new URL(loginAuthUrl({ redirectUri: "https://salutti.vercel.app/api/auth/google/retorno", state: "s", challenge: "c" }));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("access_type")).toBeNull();
  });

  it("lê sub, e-mail (minúsculo), confirmação e nome do id_token", () => {
    const id = identityFromIdToken(idToken({ sub: "123", aud: "cliente", email: "Ana@Gmail.com", email_verified: true, name: "Ana" }), "cliente");
    expect(id).toEqual({ sub: "123", email: "ana@gmail.com", emailVerified: true, name: "Ana" });
  });

  it("recusa id_token de outro cliente, sem sub ou ilegível", () => {
    expect(identityFromIdToken(idToken({ sub: "1", aud: "outro", email: "a@b.com" }), "cliente")).toBeNull();
    expect(identityFromIdToken(idToken({ aud: "cliente", email: "a@b.com" }), "cliente")).toBeNull();
    expect(identityFromIdToken("lixo", "cliente")).toBeNull();
    expect(identityFromIdToken(undefined, "cliente")).toBeNull();
  });

  it("e-mail não confirmado vem marcado como tal", () => {
    const id = identityFromIdToken(idToken({ sub: "1", aud: "cliente", email: "a@b.com", email_verified: false }), "cliente");
    expect(id?.emailVerified).toBe(false);
  });

  it("troca o código pela identidade e falha sem id_token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id_token: idToken({ sub: "9", aud: "cliente", email: "x@y.com", email_verified: "true" }) })));
    await expect(exchangeLoginCode({ code: "c", redirectUri: "r", verifier: "v" })).resolves.toMatchObject({ sub: "9", emailVerified: true });
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "a" })));
    await expect(exchangeLoginCode({ code: "c", redirectUri: "r", verifier: "v" })).rejects.toThrow();
  });
});
