// Verificação em duas etapas: TOTP (RFC 6238, SHA-1, 6 dígitos, passo de 30 s), compatível com
// Google Authenticator, Microsoft Authenticator, 1Password etc. Implementação com node:crypto.
import crypto from "node:crypto";

const STEP = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (buf: Buffer) => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input: string) => {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("base32 inválido");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function totpCode(secret: string, timeSeconds = Date.now() / 1000) {
  const counter = Math.floor(timeSeconds / STEP);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(bin).padStart(DIGITS, "0");
}

// Aceita o código do passo atual e de um passo antes/depois (relógio do celular adiantado ou atrasado).
export function verifyTotp(secret: string, code: string, timeSeconds = Date.now() / 1000) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return [-1, 0, 1].some((w) => {
    const expected = totpCode(secret, timeSeconds + w * STEP);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean));
  });
}

export const otpauthUrl = (secret: string, account: string, issuer = "Salutti") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// --- segredo cifrado no banco (AES-256-GCM, chave derivada do AUTH_SECRET) ---
const key = () =>
  Buffer.from(
    crypto.hkdfSync("sha256", process.env.AUTH_SECRET ?? "dev-secret-salutti-prototype", Buffer.alloc(0), "salutti-totp-v1", 32),
  );

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string) {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1") throw new Error("formato de segredo desconhecido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// --- códigos de recuperação: 8 códigos "xxxx-xxxx", mostrados uma vez, guardados como hash ---
const hashCode = (code: string) => crypto.createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

export function generateRecoveryCodes(n = 8) {
  const codes = Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString("hex").slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}

// Devolve os hashes restantes se o código for válido (uso único), ou null.
export function consumeRecoveryCode(hashesJson: string | null, code: string) {
  if (!hashesJson) return null;
  const hashes = JSON.parse(hashesJson) as string[];
  const h = hashCode(code);
  const idx = hashes.indexOf(h);
  if (idx === -1) return null;
  return hashes.filter((_, i) => i !== idx);
}

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
