"use client";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/phone";
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
export function InviteBox({
  patientId,
  phone,
  firstName,
  activated,
  canInvite,
  editHref,
}: {
  patientId: string;
  phone: string | null;
  firstName: string;
  activated: boolean;
  canInvite: boolean;
  editHref: string;
}) {
  const t = useTranslations("portal.pro.invite");
  const f = useFormat();
  const [state, action] = useFormState<InviteResult, FormData>(createInviteAction, null);
  const message = state?.link ? t(activated ? "whatsappReset" : "whatsappText", { name: firstName, link: state.link }) : "";
  // Telefone do cadastro já está em E.164 (com DDI); sem telefone, o WhatsApp pergunta para quem enviar.
  const wa = phone ? whatsappLink(phone, message) : `https://wa.me/?text=${encodeURIComponent(message)}`;

  // Sem data de nascimento nem CPF, o paciente não teria o que confirmar: quem tivesse o link escolheria o login.
  if (!canInvite) {
    return (
      <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
        {t("needIdentity")}{" "}
        <Link href={editHref} className="font-medium underline underline-offset-4">
          {t("editPatient")}
        </Link>
      </p>
    );
  }

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
