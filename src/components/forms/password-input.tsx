"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

// Campo de senha com botão de mostrar/ocultar (o botão não envia o formulário e diz o estado ao leitor de tela).
export function PasswordInput({ className, ...props }: InputProps) {
  const t = useTranslations("common.password");
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("hide") : t("show")}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 grid w-10 place-content-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

// Senha nova + confirmação: avisa na hora quando não conferem (o servidor confere de novo).
export function NewPasswordFields({
  label,
  placeholder,
  className,
}: {
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const t = useTranslations("common.password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div className="space-y-2">
        <Label htmlFor="password">{label}</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={placeholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passwordConfirm">{t("confirm")}</Label>
        <PasswordInput
          id="passwordConfirm"
          name="passwordConfirm"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          aria-describedby={mismatch ? "passwordConfirm-erro" : undefined}
        />
        {mismatch ? (
          <p id="passwordConfirm-erro" className="text-xs text-destructive-strong">
            {t("mismatch")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
