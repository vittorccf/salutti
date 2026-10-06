"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/max";
import { ChevronDown, Search } from "lucide-react";
import { countryOptions, DEFAULT_COUNTRY, isContactPhone, type CountryCode } from "@/lib/phone";
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
  // Número antigo que não se interpreta (ex.: "ligar p/ mãe") aparece como está, para não ser apagado sem aviso.
  const [text, setText] = useState(initial ? initial.formatNational() : (defaultValue ?? ""));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(Boolean(defaultValue));
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => countryOptions(locale), [locale]);
  const current = options.find((o) => o.code === country);

  const parsed = text ? parsePhoneNumberFromString(text, country) : undefined;
  const valid = isContactPhone(parsed);
  const submitted = valid ? parsed!.number : text.trim();
  const showError = touched && text.length > 0 && !valid;

  const onType = (raw: string) => {
    // Colou ou digitou com "+DDI": o país passa a ser o do número.
    if (raw.trim().startsWith("+")) {
      const typer = new AsYouType();
      const formatted = typer.input(raw);
      const c = typer.getCountry();
      if (c) {
        setCountry(c);
        setText(new AsYouType(c).input(typer.getNumber()?.nationalNumber ?? ""));
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
  useEffect(() => setActive(0), [query]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q) || o.dial.includes(q) || o.code.toLowerCase() === q)
    : options;
  const listId = `${id}-paises`;
  const optionId = (code: string) => `${id}-pais-${code}`;

  const choose = (code: CountryCode) => {
    setCountry(code);
    setText((t) => new AsYouType(code).input(t.replace(/\D/g, "")));
    setOpen(false);
    inputRef.current?.focus();
  };

  // Combobox: as setas movem a opção ativa, Enter escolhe (padrão WAI-ARIA com aria-activedescendant).
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = filtered.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      setActive(i);
      document.getElementById(optionId(filtered[i]?.code ?? ""))?.scrollIntoView({ block: "nearest" });
    };
    if (e.key === "ArrowDown") move(Math.min(active + 1, last));
    else if (e.key === "ArrowUp") move(Math.max(active - 1, 0));
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active].code);
    }
  };

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
                  onKeyDown={onSearchKey}
                  placeholder="Buscar país ou DDI"
                  aria-label="Buscar país ou DDI"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={filtered[active] ? optionId(filtered[active].code) : undefined}
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ul id={listId} role="listbox" aria-label="Países" className="mt-2 max-h-64 overflow-y-auto">
                {filtered.map((o, i) => (
                  <li
                    key={o.code}
                    id={optionId(o.code)}
                    role="option"
                    aria-selected={o.code === country}
                    onClick={() => choose(o.code)}
                    onMouseMove={() => setActive(i)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      i === active && "bg-accent text-accent-foreground",
                      o.code === country && "font-medium",
                    )}
                  >
                    <Flag code={o.code} />
                    <span className="flex-1 truncate">{o.name}</span>
                    <span className="tabular-nums text-muted-foreground">{o.dial}</span>
                  </li>
                ))}
              </ul>
              {filtered.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum país encontrado.</p> : null}
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
          onBlur={() => setTouched(true)}
          placeholder={placeholder ?? (country === "BR" ? "(62) 99999-0000" : "")}
          required={required}
          aria-invalid={showError}
          aria-describedby={showError ? `${id}-erro` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none placeholder:text-muted-foreground"
        />
      </div>
      <input type="hidden" name={name} value={submitted} />
      {/* País escolhido: o servidor interpreta o número digitado sem DDI com este país, não com o Brasil. */}
      <input type="hidden" name={`${name}Country`} value={country} />
      {showError ? (
        <p id={`${id}-erro`} className="mt-1 text-xs text-destructive-strong">
          Número incompleto ou inválido para {current?.name ?? "o país escolhido"}.
        </p>
      ) : null}
    </div>
  );
}
