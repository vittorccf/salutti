"use client";
import { useState } from "react";
import { useFormState } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormError } from "@/components/forms/form-error";
import { inviteMemberAction } from "../../_actions/team";

// Convite por link: sem serviço de e-mail configurado, quem convida copia o link e manda para a pessoa.
export function InviteForm({ roles }: { roles: readonly string[] }) {
  const t = useTranslations("settings.access");
  const tRole = useTranslations("common.labels.role");
  const [state, action] = useFormState(inviteMemberAction, null);
  const [copied, setCopied] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.erro} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="space-y-1">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input id="invite-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <Select id="invite-role" name="role" defaultValue={roles.includes("professional") ? "professional" : roles[0]}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {tRole(r)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button type="submit" size="sm">{t("invite")}</Button>
      {state?.link ? (
        <div role="status" className="space-y-2 rounded-md bg-success/10 p-3 text-sm">
          <p className="text-success-strong">{state.ok}</p>
          <div className="flex gap-2">
            <Input readOnly value={state.link} aria-label={t("linkLabel")} onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
        </div>
      ) : null}
    </form>
  );
}
