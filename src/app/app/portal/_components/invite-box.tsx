"use client";
import { useFormState, useFormStatus } from "react-dom";
import { MessageCircle } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { useFormat, useTranslations } from "@/i18n/client";
import { createInviteAction, type InviteResult } from "../_actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {label}
    </Button>
  );
}

// Gera o convite do portal e mostra o link uma vez, com copiar e enviar pelo WhatsApp do profissional.
// O link não fica guardado (só o hash): para reenviar, gere outro.
export function InviteBox({ patientId, phone, firstName, activated }: { patientId: string; phone: string | null; firstName: string; activated: boolean }) {
  const t = useTranslations("portal.pro.invite");
  const f = useFormat();
  const [state, action] = useFormState<InviteResult, FormData>(createInviteAction, null);
  const message = state?.link ? t(activated ? "whatsappReset" : "whatsappText", { name: firstName, link: state.link }) : "";
  const wa = phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <FormError message={state?.erro} />
      {state?.link ? (
        <div className="space-y-3 rounded-lg border border-brand/30 bg-accent/40 p-3" role="status">
          <p className="text-sm font-medium">{t("ready", { date: f.dateTime(state.expiresAt!) })}</p>
          <p className="break-all rounded-md bg-background px-3 py-2 font-mono text-xs">{state.link}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={state.link} label={t("copy")} copiedLabel={t("copied")} />
            <Button asChild variant="outline">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden /> {t("whatsapp")}
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("onceHint")}</p>
        </div>
      ) : null}
      <Submit label={state?.link ? t("again") : activated ? t("reset") : t("create")} />
    </form>
  );
}
