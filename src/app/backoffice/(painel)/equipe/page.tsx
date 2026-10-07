import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import { BACKOFFICE_ROLES, backofficeRoleLabel } from "@/lib/backoffice/labels";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado."),
  role: z.enum(["admin", "suporte"]),
  password: z.string().min(10, "Senha provisória: pelo menos 10 caracteres."),
});

async function createStaffAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira os campos." };
  if (await db.backofficeUser.findUnique({ where: { username: parsed.data.username } })) {
    return { erro: "Esse usuário já existe." };
  }
  const user = await db.backofficeUser.create({
    data: {
      name: parsed.data.name,
      username: parsed.data.username,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: true,
    },
  });
  await recordBackofficeAudit({ userId: me.id, action: "staff.create", entity: "BackofficeUser", entityId: user.id, metadata: { role: user.role } });
  revalidatePath("/backoffice/equipe");
  return { ok: `${user.name} pode entrar com “${user.username}” e a senha provisória.` };
}

const updateSchema = z.object({ id: z.string().min(1), op: z.enum(["toggle", "reset", "role"]), password: z.string().optional(), role: z.enum(["admin", "suporte"]).optional() });

async function updateStaffAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ role: "admin" });
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    op: formData.get("op"),
    password: formData.get("password") || undefined,
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) return { erro: "Confira os campos." };
  const { id, op } = parsed.data;
  if (id === me.id && op !== "reset") return { erro: "Você não pode desativar nem rebaixar a própria conta." };
  const target = await db.backofficeUser.findUnique({ where: { id } });
  if (!target) return { erro: "Usuário não encontrado." };

  if (op === "toggle") {
    await db.backofficeUser.update({ where: { id }, data: { active: !target.active } });
  } else if (op === "role") {
    if (!parsed.data.role) return { erro: "Escolha o papel." };
    await db.backofficeUser.update({ where: { id }, data: { role: parsed.data.role } });
  } else {
    if (!parsed.data.password || parsed.data.password.length < 10) return { erro: "Senha provisória: pelo menos 10 caracteres." };
    await db.backofficeUser.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }
  await recordBackofficeAudit({ userId: me.id, action: `staff.${op}`, entity: "BackofficeUser", entityId: id });
  revalidatePath("/backoffice/equipe");
  return {
    ok:
      op === "toggle"
        ? `${target.name} ${target.active ? "desativado" : "reativado"}.`
        : op === "role"
          ? "Papel atualizado."
          : `Senha provisória definida. ${target.name} troca no próximo acesso.`,
  };
}

export default async function StaffPage() {
  const me = await requireBackoffice({ role: "admin" });
  const staff = await db.backofficeUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe do backoffice</h1>
        <p className="text-sm text-muted-foreground">
          Quem acessa o backoffice. Suporte atende chamados e consulta clientes; administrador também muda planos e a equipe.
        </p>
      </div>

      <Card>
        <CardContent className="pt-2">
          <Table>
            <THead>
              <TR>
                <TH>Pessoa</TH>
                <TH>Papel</TH>
                <TH>Situação</TH>
                <TH>Último acesso</TH>
                <TH className="text-right">Ações</TH>
              </TR>
            </THead>
            <TBody>
              {staff.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <span className="block font-medium">
                      {s.name}
                      {s.id === me.id ? <span className="text-xs text-muted-foreground"> (você)</span> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">{s.username}</span>
                  </TD>
                  <TD>
                    {s.id === me.id ? (
                      backofficeRoleLabel(s.role)
                    ) : (
                      <ActionForm action={updateStaffAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="op" value="role" />
                        <Label htmlFor={`role-${s.id}`} className="sr-only">
                          Papel de {s.name}
                        </Label>
                        <Select id={`role-${s.id}`} name="role" defaultValue={s.role} className="h-9 w-auto">
                          {Object.entries(BACKOFFICE_ROLES).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" variant="ghost" size="sm">
                          Salvar
                        </Button>
                      </ActionForm>
                    )}
                  </TD>
                  <TD>
                    <span className="flex flex-wrap gap-1">
                      {s.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Desativado</Badge>}
                      {s.mustChangePassword ? <Badge variant="warning">Senha provisória</Badge> : null}
                    </span>
                  </TD>
                  <TD className="text-sm">{s.lastLoginAt ? formatDateTimeBR(s.lastLoginAt) : "Nunca"}</TD>
                  <TD className="text-right">
                    {s.id !== me.id ? (
                      <div className="flex flex-col items-end gap-2">
                        <ActionForm action={updateStaffAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="op" value="toggle" />
                          <Button type="submit" variant="outline" size="sm">
                            {s.active ? "Desativar" : "Reativar"}
                          </Button>
                        </ActionForm>
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Redefinir senha</summary>
                          <ActionForm action={updateStaffAction} className="mt-2 flex items-center gap-2">
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="op" value="reset" />
                            <Label htmlFor={`pw-${s.id}`} className="sr-only">
                              Senha provisória de {s.name}
                            </Label>
                            <PasswordInput id={`pw-${s.id}`} name="password" minLength={10} required autoComplete="new-password" className="h-9 w-44" />
                            <Button type="submit" size="sm">
                              Definir
                            </Button>
                          </ActionForm>
                        </details>
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Adicionar pessoa</CardTitle>
          <CardDescription>Ela entra com a senha provisória e define a própria no primeiro acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createStaffAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuário</Label>
              <Input id="username" name="username" required autoCapitalize="none" pattern="[a-z0-9._\-]{3,40}" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Papel</Label>
              <Select id="role" name="role" defaultValue="suporte">
                {Object.entries(BACKOFFICE_ROLES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha provisória</Label>
              <PasswordInput id="password" name="password" minLength={10} required autoComplete="new-password" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Adicionar</Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
