"use client";
import { NewPasswordFields } from "@/components/forms/password-input";
import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { EmailInput } from "@/components/forms/email-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/account";
import { segmentsFor, type Area } from "@/lib/areas";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n/client";
import { signupAction } from "./_actions";

const ICONS: Record<AccountType, typeof UserRound> = { autonomo: UserRound, clinica: Building2 };

// Chave em common.labels.segmentOption: "odonto" tem rótulo próprio quando a conta é de clínica.
const segmentKey = (type: AccountType, value: string) => (type === "clinica" && value === "odonto" ? "odonto_clinica" : value);

// Cadastro em duas partes: primeiro o tipo de conta (autônomo ou clínica), depois os campos que valem para ele.
// Na Salutti Estética o foco é a profissional autônoma: o tipo já vem escolhido (dá para trocar para clínica).
export function SignupForm({ area = "mental" }: { area?: Area }) {
  const [type, setType] = useState<AccountType | null>(area === "estetica" ? "autonomo" : null);
  const t = useTranslations("auth.signup.form");
  const labels = useTranslations("common.labels");

  return (
    <ActionForm action={signupAction} className="space-y-4">
      <input type="hidden" name="area" value={area} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("accountTypeLegend")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((kind) => {
            const Icon = ICONS[kind];
            return (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  type === kind && "border-brand bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={kind}
                  required
                  className="sr-only"
                  checked={type === kind}
                  onChange={() => setType(kind)}
                />
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-semibold">{labels(`accountType.${kind}`)}</span>
                  <span className="block text-xs text-muted-foreground">{labels(`accountTypeDescription.${kind}`)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("changeLater")}</p>
      </fieldset>

      {type ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <EmailInput id="email" name="email" required />
            </div>
          </div>
          <NewPasswordFields label={t("password")} placeholder={t("passwordPlaceholder")} />
          <div className="space-y-2">
            <Label htmlFor="birthDate">{t("birthDate")}</Label>
            <Input id="birthDate" name="birthDate" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspaceName">{type === "clinica" ? t("clinicName") : t("officeName")}</Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              required={type === "clinica"}
              placeholder={type === "clinica" ? t("clinicPlaceholder") : t("officePlaceholder")}
            />
          </div>
          {type === "clinica" ? (
            <div className="space-y-2">
              <Label htmlFor="cnpj">{t("cnpj")}</Label>
              <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" autoCapitalize="characters" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="segment">{t("segment")}</Label>
            <Select id="segment" name="segment" key={type} defaultValue={segmentsFor(area, type)[0]}>
              {segmentsFor(area, type).map((s) => (
                <option key={s} value={s}>
                  {labels(`segmentOption.${segmentKey(type, s)}`)}
                </option>
              ))}
            </Select>
          </div>
          <Button className="w-full">{t("submit")}</Button>
        </>
      ) : null}
    </ActionForm>
  );
}
