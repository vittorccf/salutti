"use client";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

export type AddressValue = {
  cep?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

const maskCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

// Endereço brasileiro: o CEP preenche rua, bairro, cidade e UF; o número fica com a pessoa.
export function AddressFields({ defaultValue = {}, idPrefix = "" }: { defaultValue?: AddressValue; idPrefix?: string }) {
  const [v, setV] = useState({
    cep: maskCep(defaultValue.cep ?? ""),
    street: defaultValue.street ?? "",
    addressNumber: defaultValue.addressNumber ?? "",
    complement: defaultValue.complement ?? "",
    district: defaultValue.district ?? "",
    city: defaultValue.city ?? "",
    state: defaultValue.state ?? "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "notfound" | "error">("idle");
  const t = useTranslations("common.address");
  const numberRef = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const id = (f: string) => `${idPrefix}${f}`;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function lookup(cep: string) {
    // Só a última busca vale: corrigir o CEP no meio da consulta não deixa a resposta antiga sobrescrever.
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    setStatus("loading");
    try {
      const res = await fetch(`/api/cep/${cep.replace(/\D/g, "")}`, { signal: ctrl.signal });
      if (res.status === 404) return setStatus("notfound");
      if (!res.ok) return setStatus("error");
      const a = (await res.json()) as { street: string; district: string; city: string; state: string };
      // CEP de cidade com CEP único vem sem rua: limpa a rua do CEP anterior em vez de misturar.
      setV((s) => ({ ...s, street: a.street, district: a.district, city: a.city, state: a.state }));
      setStatus("idle");
      numberRef.current?.focus();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setStatus("error");
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id("cep")}>{t("cep")}</Label>
        <div className="relative">
          <Input
            id={id("cep")}
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={v.cep}
            onChange={(e) => {
              const cep = maskCep(e.target.value);
              setV((s) => ({ ...s, cep }));
              setStatus("idle");
              if (cep.length === 9) void lookup(cep);
              else pending.current?.abort();
            }}
            aria-describedby={status !== "idle" ? id("cep-status") : undefined}
          />
          {status === "loading" ? (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" aria-label={t("loading")} />
          ) : null}
        </div>
        {/* Região viva sempre presente: leitores de tela anunciam a mudança de texto. */}
        <p id={id("cep-status")} className="text-xs text-muted-foreground empty:hidden" role="status">
          {status === "notfound"
            ? t("notFound")
            : status === "error"
              ? t("unavailable")
              : ""}
        </p>
      </div>
      <div className="space-y-1 sm:col-span-4">
        <Label htmlFor={id("street")}>{t("street")}</Label>
        <Input id={id("street")} name="street" autoComplete="address-line1" value={v.street} onChange={set("street")} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id("addressNumber")}>{t("number")}</Label>
        <Input ref={numberRef} id={id("addressNumber")} name="addressNumber" value={v.addressNumber} onChange={set("addressNumber")} />
      </div>
      <div className="space-y-1 sm:col-span-4">
        <Label htmlFor={id("complement")}>{t("complement")}</Label>
        <Input id={id("complement")} name="complement" autoComplete="address-line2" placeholder={t("complementPlaceholder")} value={v.complement} onChange={set("complement")} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={id("district")}>{t("district")}</Label>
        <Input id={id("district")} name="district" value={v.district} onChange={set("district")} />
      </div>
      <div className="space-y-1 sm:col-span-3">
        <Label htmlFor={id("city")}>{t("city")}</Label>
        <Input id={id("city")} name="city" autoComplete="address-level2" value={v.city} onChange={set("city")} />
      </div>
      <div className="space-y-1 sm:col-span-1">
        <Label htmlFor={id("state")}>{t("state")}</Label>
        <Input id={id("state")} name="state" autoComplete="address-level1" maxLength={2} value={v.state} onChange={(e) => setV((s) => ({ ...s, state: e.target.value.toUpperCase() }))} />
      </div>
    </div>
  );
}
