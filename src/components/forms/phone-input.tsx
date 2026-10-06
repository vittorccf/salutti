"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import { ChevronDown, Search } from "lucide-react";
import { countryOptions, DEFAULT_COUNTRY, type CountryCode } from "@/lib/phone";
import { Flag } from "@/components/ui/flag";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  name: string;
  defaultValue?: string | null; // E.164
  required?: boolean;
  locale?: string;
  placeholder?: string;
};

// Campo de telefone com país (bandeira + DDI), máscara do país enquanto digita e valor enviado em E.164.
export function PhoneInput({ id, name, defaultValue, required, locale = "pt-BR", placeholder }: Props) {
  const initial = defaultValue ? parsePhoneNumberFromString(defaultValue, DEFAULT_COUNTRY) : undefined;
  const [country, setCountry] = useState<CountryCode>((initial?.country as CountryCode) ?? DEFAULT_COUNTRY);
  const [text, setText] = useState(initial ? initial.formatNational() : "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => countryOptions(locale), [locale]);
  const current = options.find((o) => o.code === country);

  const parsed = text ? parsePhoneNumberFromString(text, country) : undefined;
  const valid = Boolean(parsed?.isValid());
  const submitted = valid ? parsed!.number : text.trim();

  const onType = (raw: string) => {
    // Colou ou digitou com "+DDI": o país passa a ser o do número.
    if (raw.trim().startsWith("+")) {
      const typer = new AsYouType();
      const formatted = typer.input(raw);
      const c = typer.getCountry();
      if (c) {
        setCountry(c);
        setText(new AsYouType(c).input(typer.getNationalNumber()));
        return;
      }
      setText(formatted);
      return;
    }
    // Ao apagar, não reformatar (senão o cursor "trava" nos separadores).
    setText(raw.length < text.length ? raw : new AsYouType(country).input(raw));
  };

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q) || o.dial.includes(q) || o.code.toLowerCase() === q)
    : options;

  return (
    <div>
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        )}
      >
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            type="button"
            aria-label={`País do telefone: ${current?.name ?? country} (${current?.dial ?? ""})`}
            className="flex h-full shrink-0 items-center gap-1.5 rounded-l-md border-r px-2.5 hover:bg-accent focus-visible:outline-none"
          >
            <Flag code={country} />
            <span className="tabular-nums text-muted-foreground">{current?.dial}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              className="z-50 w-72 rounded-lg border bg-popover p-2 text-popover-foreground shadow-sm"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).querySelector("input")?.focus();
              }}
            >
              <div className="flex items-center gap-2 rounded-md border px-2">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar país ou DDI"
                  aria-label="Buscar país ou DDI"
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ul role="listbox" aria-label="Países" className="mt-2 max-h-64 overflow-y-auto">
                {filtered.map((o) => (
                  <li key={o.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.code === country}
                      onClick={() => {
                        setCountry(o.code);
                        setText((t) => new AsYouType(o.code).input(t.replace(/\D/g, "")));
                        setOpen(false);
                        inputRef.current?.focus();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                        o.code === country && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Flag code={o.code} />
                      <span className="flex-1 truncate">{o.name}</span>
                      <span className="tabular-nums text-muted-foreground">{o.dial}</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum país encontrado.</li> : null}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={text}
          onChange={(e) => onType(e.target.value)}
          placeholder={placeholder ?? (country === "BR" ? "(62) 99999-0000" : "")}
          required={required}
          aria-invalid={text.length > 0 && !valid}
          aria-describedby={text.length > 0 && !valid ? `${id}-erro` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-muted-foreground"
        />
      </div>
      <input type="hidden" name={name} value={submitted} />
      {text.length > 0 && !valid ? (
        <p id={`${id}-erro`} className="mt-1 text-xs text-destructive-strong">
          Número incompleto ou inválido para {current?.name ?? "o país escolhido"}.
        </p>
      ) : null}
    </div>
  );
}
