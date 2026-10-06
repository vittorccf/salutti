import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, mediaUrl, readImageUpload, sniffImage, UploadError } from "@/lib/media";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
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
    await expect(readImageUpload(form({ photo: big }), "photo")).rejects.toThrow(/grande demais/);

    expect(await readImageUpload(form({ photo: new File([], "") }), "photo")).toBeNull();
    expect(await readImageUpload(form({ photoRemove: "on" }), "photo")).toBe("remove");
    expect(mediaUrl("abc")).toBe("/api/media/abc");
    expect(mediaUrl(null)).toBeNull();
  });
});
