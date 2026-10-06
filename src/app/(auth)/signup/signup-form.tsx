"use client";
import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { EmailInput } from "@/components/forms/email-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ACCOUNT_TYPES, SEGMENTS, type AccountType } from "@/lib/account";
import { cn } from "@/lib/utils";
import { signupAction } from "./_actions";

const ICONS: Record<AccountType, typeof UserRound> = { autonomo: UserRound, clinica: Building2 };

// Cadastro em duas partes: primeiro o tipo de conta (autônomo ou clínica), depois os campos que valem para ele.
export function SignupForm() {
  const [type, setType] = useState<AccountType | null>(null);

  return (
    <ActionForm action={signupAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Como você atende?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => {
            const Icon = ICONS[t];
            return (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/40",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  type === t && "border-primary bg-accent/40",
                )}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={t}
                  required
                  className="sr-only"
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
                <span>
                  <span className="block font-semibold">{ACCOUNT_TYPES[t].label}</span>
                  <span className="block text-xs text-muted-foreground">{ACCOUNT_TYPES[t].description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Dá para mudar depois em Ajustes, sem perder dados.</p>
      </fieldset>

      {type ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Seu nome</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <EmailInput id="email" name="email" required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">Seu aniversário (opcional)</Label>
              <Input id="birthDate" name="birthDate" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspaceName">{type === "clinica" ? "Nome da clínica" : "Nome do consultório (opcional)"}</Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              required={type === "clinica"}
              placeholder={type === "clinica" ? "Clínica Acolher" : "Em branco, usamos “Consultório de” + seu nome"}
            />
          </div>
          {type === "clinica" ? (
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ (opcional)</Label>
              <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" autoCapitalize="characters" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="segment">Área de atendimento</Label>
            <Select id="segment" name="segment" key={type} defaultValue={SEGMENTS[type][0].value}>
              {SEGMENTS[type].map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <Button className="w-full">Criar conta</Button>
        </>
      ) : null}
    </ActionForm>
  );
}
