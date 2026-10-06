import { describe, expect, it } from "vitest";
import { imageSize, MAX_IMAGE_BYTES, mediaUrl, readImageUpload, sniffImage, UploadError } from "@/lib/media";

// Cabeçalho PNG com IHDR (largura e altura em big-endian nos bytes 16-23).
const png = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const PNG = png(64, 48);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

const form = (entries: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("imagens enviadas", () => {
  it("reconhece o tipo pelo conteúdo, não pelo nome", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPG)).toBe("image/jpeg");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("aceita imagem válida, recusa formato errado e arquivo grande; vazio = nada enviado", async () => {
    const ok = await readImageUpload(form({ photo: new File([PNG], "x.jpg", { type: "image/jpeg" }) }), "photo");
    expect(ok).toMatchObject({ mime: "image/png" });

    const html = new File(["<html>"], "foto.png", { type: "image/png" });
    await expect(readImageUpload(form({ photo: html }), "photo")).rejects.toBeInstanceOf(UploadError);

    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "g.png", { type: "image/png" });
    await expect(readImageUpload(form({ photo: big }), "photo")).rejects.toThrow(/imageTooBig/);

    expect(await readImageUpload(form({ photo: new File([], "") }), "photo")).toBeNull();
    expect(await readImageUpload(form({ photoRemove: "on" }), "photo")).toBe("remove");
    expect(mediaUrl("abc")).toBe("/api/media/abc");
    expect(mediaUrl(null)).toBeNull();
  });

  it("lê as dimensões do cabeçalho e recusa imagem gigante enviada sem passar pelo navegador", async () => {
    expect(imageSize(PNG)).toEqual({ w: 64, h: 48 });
    // JPEG: SOI, APP0 curto, SOF0 com altura 300 e largura 400.
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c, 0x01, 0x90, 3, 0, 0]);
    expect(imageSize(jpg)).toEqual({ w: 400, h: 300 });
    const huge = new File([png(30000, 30000)], "g.png", { type: "image/png" });
    await expect(readImageUpload(form({ photo: huge }), "photo")).rejects.toThrow(/imageDimensions/);
  });
});
