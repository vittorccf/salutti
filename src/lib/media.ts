// Upload de imagem vindo de formulário: o navegador já reduz e converte (ImageUpload); aqui o servidor
// confere tamanho e o tipo real pelo conteúdo (assinatura do arquivo), não pelo nome nem pelo tipo declarado.
export class UploadError extends Error {}

export const MAX_IMAGE_BYTES = 800 * 1024;

export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  )
    return "image/webp";
  return null;
}

export const MAX_IMAGE_SIDE = 4000;

// Largura e altura lidas do cabeçalho do arquivo (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X), sem decodificar.
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le16 = (i: number) => b[i] | (b[i + 1] << 8);
  const le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const type = sniffImage(b);
  const be32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | be16(i + 2)) >>> 0;
  if (type === "image/png" && b.length >= 24) return { w: be32(16), h: be32(20) };
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: be16(i + 5), w: be16(i + 7) };
      i += 2 + be16(i + 2);
    }
    return null;
  }
  if (type === "image/webp" && b.length >= 30) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8 ") return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
    if (chunk === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    if (chunk === "VP8X") return { w: 1 + le24(24), h: 1 + le24(27) };
  }
  return null;
}

// null = nada enviado; "remove" = pediu para tirar a imagem atual.
export async function readImageUpload(formData: FormData, name: string): Promise<{ mime: string; bytes: Buffer } | "remove" | null> {
  if (formData.get(`${name}Remove`) === "on") return "remove";
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Imagem grande demais. Envie uma foto de até 800 KB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new UploadError("Formato não aceito. Envie JPG, PNG ou WebP.");
  const size = imageSize(bytes);
  if (!size || size.w < 1 || size.h < 1 || size.w > MAX_IMAGE_SIDE || size.h > MAX_IMAGE_SIDE) throw new UploadError("Imagem com dimensões inválidas ou grandes demais.");
  return { mime, bytes };
}

export const mediaUrl = (id: string | null | undefined) => (id ? `/api/media/${id}` : null);
