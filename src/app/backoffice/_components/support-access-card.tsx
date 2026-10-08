"use client";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Copy, KeyRound } from "lucide-react";
import { FormError } from "@/components/forms/form-error";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type GrantResult = { erro?: string; password?: string; email?: string; expiresAt?: string } | null;

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <KeyRound className="h-4 w-4" aria-hidden />
      {pending ? "Gerando…" : children}
    </Button>
  );
}

const remaining = (iso: string) => Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => remaining(expiresAt));
  useEffect(() => {
    const id = setInterval(() => setLeft(remaining(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left > 0 ? (
    <span className="tabular-nums">Expira em {mmss(left)}</span>
  ) : (
    <span className="font-medium text-destructive-strong">Expirada. Gere outra se precisar.</span>
  );
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="h-4 w-4" aria-hidden />
          {copied ? "Copiado" : null}
        </Button>
      </div>
    </div>
  );
}

// Gera a senha do "Suporte Salutti" para este consultório. A senha aparece uma única vez (o banco guarda só o hash).
export function SupportAccessCard({
  action,
  workspaceId,
  defaultReason,
  ticketId,
}: {
  action: (prev: GrantResult, formData: FormData) => Promise<GrantResult>;
  workspaceId: string;
  defaultReason?: string;
  ticketId?: string;
}) {
  const [state, formAction] = useFormState(action, null);

  if (state?.password && state.email && state.expiresAt) {
    return (
      <div className="space-y-3" role="status">
        <p className="text-sm">
          Entre no <strong>login do app</strong> (de preferência numa janela anônima) com estes dados. A senha vale um login e some ao
          expirar.
        </p>
        <CopyField id="support-email" label="E-mail" value={state.email} />
        <CopyField id="support-password" label="Senha" value={state.password} />
        <p className="text-sm text-muted-foreground">
          <Countdown expiresAt={state.expiresAt} />
        </p>
        <Button asChild variant="outline" className="w-full">
          <a href="/login" target="_blank" rel="noopener noreferrer">
            Abrir o login do app
          </a>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state?.erro} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {ticketId ? <input type="hidden" name="ticketId" value={ticketId} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="reason">Motivo</Label>
        <Input id="reason" name="reason" required minLength={10} maxLength={200} defaultValue={defaultReason} placeholder="Ex.: chamado #12, agenda não salva" />
        <p className="text-xs text-muted-foreground">O cliente vê este motivo no aviso de acesso: não cite nomes de pacientes.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Sua senha do backoffice</Label>
        <PasswordInput id="confirmPassword" name="confirmPassword" required autoComplete="current-password" />
      </div>
      <Submit>Acessar conta</Submit>
    </form>
  );
}
