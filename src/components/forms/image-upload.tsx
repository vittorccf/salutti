"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  name: string;
  label: string;
  /** square = foto (recorte central 320×320); banner = imagem larga (até 1200×400, sem recorte) */
  shape: "square" | "banner";
  currentUrl?: string | null;
  hint?: string;
  /** exige marcar a autorização ao escolher uma imagem nova (ex.: foto de paciente) */
  consentLabel?: string;
};

const SIZES = { square: { w: 320, h: 320 }, banner: { w: 1200, h: 400 } };

// Reduz e converte no navegador antes de enviar: a foto do celular (vários MB) vira um WebP de poucas
// dezenas de KB, e os metadados da câmera (EXIF, inclusive localização) ficam para trás.
async function shrink(file: File, shape: Props["shape"]): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { w, h } = SIZES[shape];
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height, dw: number, dh: number;
  if (shape === "square") {
    const side = Math.min(bitmap.width, bitmap.height);
    sx = (bitmap.width - side) / 2;
    sy = (bitmap.height - side) / 2;
    sw = sh = side;
    dw = dh = Math.min(w, side);
  } else {
    const scale = Math.min(1, w / bitmap.width, h / bitmap.height);
    dw = Math.round(bitmap.width * scale);
    dh = Math.round(bitmap.height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  // Navegador sem WebP no canvas devolve PNG; nesse caso, JPEG fica menor.
  const out = blob?.type === "image/webp" ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!out) throw new Error("conversão");
  return new File([out], out.type === "image/webp" ? "imagem.webp" : "imagem.jpg", { type: out.type });
}

export function ImageUpload({ name, label, shape, currentUrl, hint, consentLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [picked, setPicked] = useState(false);
  const [remove, setRemove] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const id = `${name}-arquivo`;
  const t = useTranslations("common.image");
  // Rótulo sem o "(opcional)" do fim, em qualquer idioma, para completar o nome acessível dos botões.
  const shortLabel = label.replace(/ \([^)]*\)$/, "").toLowerCase();

  // Libera a URL temporária da prévia ao trocar de imagem ou sair da tela.
  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ text: t("preparing") });
    try {
      const small = await shrink(file, shape);
      const dt = new DataTransfer();
      dt.items.add(small);
      e.target.files = dt.files;
      setPreview(URL.createObjectURL(small));
      setPicked(true);
      setRemove(false);
      setStatus({ text: t("ready") });
    } catch {
      e.target.value = "";
      setPicked(false);
      setStatus({ text: t("unreadable"), error: true });
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium" id={`${id}-rotulo`}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "grid shrink-0 place-content-center overflow-hidden border bg-muted text-muted-foreground",
            shape === "square" ? "h-16 w-16 rounded-full" : "h-16 w-48 rounded-md",
          )}
        >
          {preview && !remove ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem privada servida por /api/media ou blob local
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-6 w-6" aria-hidden />
          )}
        </div>
        <div className="space-y-1">
          <input
            ref={fileRef}
            id={id}
            type="file"
            name={name}
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-labelledby={`${id}-rotulo`}
            onChange={onPick}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              aria-describedby={`${id}-dica`}
            >
              <ImagePlus className="h-4 w-4" aria-hidden /> {preview ? t("replace") : t("upload")}
              <span className="sr-only"> ({shortLabel})</span>
            </Button>
            {currentUrl ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`${name}Remove`}
                  checked={remove}
                  onChange={(e) => setRemove(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span>
                  {t("remove")}<span className="sr-only"> {shortLabel}</span>
                </span>
              </label>
            ) : null}
          </div>
          <p id={`${id}-dica`} className={cn("text-xs", status?.error ? "text-destructive-strong" : "text-muted-foreground")} role="status">
            {status?.text ?? hint}
          </p>
          {consentLabel && picked && !remove ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name={`${name}Consent`} required className="mt-0.5 h-4 w-4 accent-primary" />
              <span>{consentLabel}</span>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
