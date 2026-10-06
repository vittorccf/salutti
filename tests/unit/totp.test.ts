import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "@/lib/totp";

// Segredo do apêndice B da RFC 6238 (SHA-1): "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("bate com os vetores oficiais (6 últimos dígitos)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(RFC_SECRET, 59)).toBe("287082");
    expect(totpCode(RFC_SECRET, 1111111109)).toBe("081804");
    expect(totpCode(RFC_SECRET, 1111111111)).toBe("050471");
    expect(totpCode(RFC_SECRET, 1234567890)).toBe("005924");
    expect(totpCode(RFC_SECRET, 2000000000)).toBe("279037");
  });

  it("aceita um passo de tolerância e recusa o resto", () => {
    const t = 1_800_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 30), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t + 30), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 90), t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12345", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", t)).toBe(false);
  });

  it("base32 ida e volta e segredo novo com 160 bits", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it("URL otpauth para o QR", () => {
    expect(otpauthUrl("ABC", "ana@x.dev")).toBe(
      "otpauth://totp/Salutti%3Aana%40x.dev?secret=ABC&issuer=Salutti&algorithm=SHA1&digits=6&period=30",
    );
  });
});

describe("segredo cifrado e códigos de recuperação", () => {
  it("cifra com IV aleatório e decifra", () => {
    const a = encryptSecret("SEGREDO");
    const b = encryptSecret("SEGREDO");
    expect(a).not.toBe(b);
    expect(a).not.toContain("SEGREDO");
    expect(decryptSecret(a)).toBe("SEGREDO");
  });

  it("recusa segredo adulterado", () => {
    const [v, iv, tag, data] = encryptSecret("SEGREDO").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("código de recuperação vale uma vez só", () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    const left = consumeRecoveryCode(JSON.stringify(hashes), codes[3].toUpperCase().replace("-", " "));
    expect(left).toHaveLength(7);
    expect(consumeRecoveryCode(JSON.stringify(left), codes[3])).toBeNull();
    expect(consumeRecoveryCode(null, codes[0])).toBeNull();
  });
});
