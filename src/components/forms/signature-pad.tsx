"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

// Assinatura com o dedo ou a caneta na tela (tablet/celular no consultório). Vai no formulário como PNG em
// data URL (campo oculto `name`); vazio quando ninguém assinou. O traço segue a cor do texto do tema.
export function SignaturePad({ name, label }: { name: string; label: string }) {
  const t = useTranslations("common.signature");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#16121f";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(canvas.current?.toDataURL("image/png") ?? "");
  };
  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setValue("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span id={`${name}-label`} className="text-sm font-medium">
          {label}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>
          <Eraser className="h-4 w-4" aria-hidden /> {t("clear")}
        </Button>
      </div>
      {/* Fundo branco fixo: a assinatura é um documento e precisa ficar legível em qualquer tema. */}
      <canvas
        ref={canvas}
        role="img"
        aria-labelledby={`${name}-label`}
        className="h-36 w-full touch-none rounded-md border border-input bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <p className="text-xs text-muted-foreground">{value ? t("signed") : t("hint")}</p>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
