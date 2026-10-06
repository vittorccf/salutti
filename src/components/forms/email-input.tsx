"use client";
import { useState } from "react";
import { suggestEmail } from "@/lib/email";
import { Input } from "@/components/ui/input";

type Props = { id: string; name: string; defaultValue?: string | null; required?: boolean; placeholder?: string };

// E-mail com sugestão para domínio digitado errado ("gmial.com" → "gmail.com").
export function EmailInput({ id, name, defaultValue, required, placeholder = "nome@email.com" }: Props) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  return (
    <div>
      <Input
        id={id}
        name={name}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setSuggestion(null);
        }}
        onBlur={() => setSuggestion(suggestEmail(value))}
        aria-describedby={suggestion ? `${id}-sugestao` : undefined}
      />
      {suggestion ? (
        <p id={`${id}-sugestao`} className="mt-1 text-xs text-muted-foreground" role="status">
          Você quis dizer{" "}
          <button
            type="button"
            className="font-medium text-primary-strong underline-offset-4 hover:underline"
            onClick={() => {
              setValue(suggestion);
              setSuggestion(null);
            }}
          >
            {suggestion}
          </button>
          ?
        </p>
      ) : null}
    </div>
  );
}
