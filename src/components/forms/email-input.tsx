"use client";
import { useState } from "react";
import { suggestEmail } from "@/lib/email";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";

type Props = { id: string; name: string; defaultValue?: string | null; required?: boolean; placeholder?: string };

// E-mail com sugestão para domínio digitado errado ("gmial.com" → "gmail.com").
export function EmailInput({ id, name, defaultValue, required, placeholder }: Props) {
  const t = useTranslations("common.email");
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
        placeholder={placeholder ?? t("placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          setSuggestion(null);
        }}
        onBlur={() => setSuggestion(suggestEmail(value))}
        aria-describedby={suggestion ? `${id}-sugestao` : undefined}
      />
      <p id={`${id}-sugestao`} className="mt-1 text-xs text-muted-foreground empty:hidden" role="status">
        {suggestion
          ? t.rich("didYouMean", {
              suggestion,
              fix: (chunks) => (
                <button
                  type="button"
                  className="font-medium text-brand underline-offset-4 hover:underline"
                  onClick={() => {
                    setValue(suggestion);
                    setSuggestion(null);
                  }}
                >
                  {chunks}
                </button>
              ),
            })
          : null}
      </p>
    </div>
  );
}
