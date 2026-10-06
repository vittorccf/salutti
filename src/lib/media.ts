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

// null = nada enviado; "remove" = pediu para tirar a imagem atual.
export async function readImageUpload(formData: FormData, name: string): Promise<{ mime: string; bytes: Buffer } | "remove" | null> {
  if (formData.get(`${name}Remove`) === "on") return "remove";
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Imagem grande demais. Envie uma foto de até 800 KB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new UploadError("Formato não aceito. Envie JPG, PNG ou WebP.");
  return { mime, bytes };
}

export const mediaUrl = (id: string | null | undefined) => (id ? `/api/media/${id}` : null);
