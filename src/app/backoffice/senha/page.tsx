import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Trocar senha · Backoffice", robots: { index: false, follow: false } };

const schema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: z.string().min(10, "A nova senha precisa de pelo menos 10 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem." })
  .refine((d) => d.password !== d.current, { message: "A nova senha precisa ser diferente da atual." })
  .refine((d) => !/^admin/i.test(d.password), { message: "Escolha uma senha que não comece com “admin”." });

async function changePasswordAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const user = await requireBackoffice({ allowPendingPassword: true });
  const parsed = schema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira os campos." };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { erro: "Senha atual incorreta." };

  await db.backofficeUser.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: false },
  });
  await recordBackofficeAudit({ userId: user.id, action: "password.change", entity: "BackofficeUser", entityId: user.id });
  redirect("/backoffice");
}

export default async function ChangePasswordPage() {
  const user = await requireBackoffice({ allowPendingPassword: true });
  return (
    <main className="ds2-glow grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>
            {user.mustChangePassword
              ? "Esta é uma senha provisória. Defina uma senha sua para continuar."
              : "Defina uma nova senha para o backoffice."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePasswordAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Senha atual</Label>
              <PasswordInput id="current" name="current" autoComplete="current-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} required />
              <p className="text-xs text-muted-foreground">Pelo menos 10 caracteres.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar nova senha</Label>
              <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={10} required />
            </div>
            <Button type="submit" className="w-full">
              Salvar senha
            </Button>
            {!user.mustChangePassword ? (
              <Link href="/backoffice" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Voltar ao painel
              </Link>
            ) : null}
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
