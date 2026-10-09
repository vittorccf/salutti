import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import {
  ALL_BO_PERMISSIONS,
  BO_PERMISSIONS,
  BO_ROLE_DEFAULTS,
  BO_ROLE_LABELS,
  BO_ROLES,
  diffFromRole,
  effectiveBoPermissions,
  grantProblem,
  isBoPermission,
  type BoPermission,
  type BoRole,
} from "@/lib/backoffice/permissions";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { PasswordInput } from "@/components/forms/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateTimeBR } from "@/lib/utils";

const roleSchema = z.enum(BO_ROLES);
const GROUPS = [...new Set(Object.values(BO_PERMISSIONS).map((p) => p.group))];

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado."),
  role: roleSchema,
  password: z.string().min(10, "Senha provisória: pelo menos 10 caracteres."),
});

type Me = Awaited<ReturnType<typeof requireBackoffice>>;

// Papel pronto só pode ser dado por quem tem todas as permissões dele (ninguém concede o que não tem).
const canGiveRole = (me: Me, role: BoRole) => {
  const mine = effectiveBoPermissions(me);
  return BO_ROLE_DEFAULTS[role].every((p) => mine.has(p));
};

// Sempre fica ao menos uma pessoa ativa que gerencia a equipe (senão ninguém mais dá permissões).
async function stillHasManager(change: { id: string; active?: boolean; role?: string; permsGranted?: string[]; permsDenied?: string[] }) {
  const staff = await db.backofficeUser.findMany({ where: { active: true } });
  const after = staff
    .map((u) => (u.id === change.id ? { ...u, ...change } : u))
    .filter((u) => u.active !== false);
  if (change.active === true && !staff.some((u) => u.id === change.id)) return true;
  return after.some((u) => effectiveBoPermissions(u).has("equipe.gerenciar"));
}

async function createStaffAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ perm: "equipe.gerenciar" });
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    username: formData.get("username"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira os campos." };
  if (!canGiveRole(me, parsed.data.role)) return { erro: "Você não pode criar alguém com permissões que você não tem." };
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

const updateSchema = z.object({
  id: z.string().min(1),
  op: z.enum(["toggle", "reset", "role", "perms"]),
  password: z.string().optional(),
  role: roleSchema.optional(),
});

async function updateStaffAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice({ perm: "equipe.gerenciar" });
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    op: formData.get("op"),
    password: formData.get("password") || undefined,
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) return { erro: "Confira os campos." };
  const { id, op } = parsed.data;
  if (id === me.id && op !== "reset") return { erro: "Você não pode mudar a própria conta (situação, papel ou permissões)." };
  const target = await db.backofficeUser.findUnique({ where: { id } });
  if (!target) return { erro: "Usuário não encontrado." };
  const before = effectiveBoPermissions(target);
  // Quem tem permissões que você não tem só pode ser alterado por alguém com pelo menos as mesmas.
  const mine = effectiveBoPermissions(me);
  if (op !== "reset" && [...before].some((p) => !mine.has(p))) {
    return { erro: "Essa pessoa tem permissões que você não tem: peça a quem tem para mudar." };
  }

  let metadata: Record<string, unknown> = {};
  if (op === "toggle") {
    if (target.active && !(await stillHasManager({ id, active: false }))) {
      return { erro: "Ficaria sem ninguém para gerenciar a equipe. Dê essa permissão a outra pessoa antes." };
    }
    await db.backofficeUser.update({ where: { id }, data: { active: !target.active } });
  } else if (op === "role") {
    const role = parsed.data.role;
    if (!role) return { erro: "Escolha o papel." };
    if (!canGiveRole(me, role)) return { erro: "Você não pode dar um papel com permissões que você não tem." };
    if (!(await stillHasManager({ id, role, permsGranted: [], permsDenied: [] }))) {
      return { erro: "Ficaria sem ninguém para gerenciar a equipe. Dê essa permissão a outra pessoa antes." };
    }
    // Trocar o papel volta ao padrão do novo papel (os ajustes eram sobre o anterior).
    await db.backofficeUser.update({ where: { id }, data: { role, permsGranted: [], permsDenied: [] } });
    metadata = { from: target.role, to: role };
  } else if (op === "perms") {
    const desired = new Set<BoPermission>(formData.getAll("perm").map(String).filter(isBoPermission));
    const problem = grantProblem(me, id, before, desired);
    if (problem) return { erro: problem === "self" ? "Você não pode mudar as próprias permissões." : "Você só pode dar ou retirar permissões que você mesmo tem." };
    const diff = diffFromRole(target.role as BoRole, desired);
    if (!(await stillHasManager({ id, ...diff }))) {
      return { erro: "Ficaria sem ninguém para gerenciar a equipe. Dê essa permissão a outra pessoa antes." };
    }
    await db.backofficeUser.update({ where: { id }, data: diff });
    metadata = {
      added: ALL_BO_PERMISSIONS.filter((p) => desired.has(p) && !before.has(p)),
      removed: ALL_BO_PERMISSIONS.filter((p) => before.has(p) && !desired.has(p)),
    };
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
  await recordBackofficeAudit({ userId: me.id, action: `staff.${op}`, entity: "BackofficeUser", entityId: id, metadata });
  revalidatePath("/backoffice/equipe");
  return {
    ok:
      op === "toggle"
        ? `${target.name} ${target.active ? "desativado" : "reativado"}.`
        : op === "role"
          ? "Papel atualizado. As permissões voltaram ao padrão do papel."
          : op === "perms"
            ? "Permissões salvas."
            : `Senha provisória definida. ${target.name} troca no próximo acesso.`,
  };
}

export default async function StaffPage() {
  const me = await requireBackoffice({ perm: "equipe.gerenciar" });
  const mine = effectiveBoPermissions(me);
  const staff = await db.backofficeUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe do backoffice</h1>
        <p className="text-sm text-muted-foreground">
          Quem acessa o backoffice e o que cada pessoa pode fazer. Cada papel é um ponto de partida; ajuste as permissões de cada pessoa
          abaixo. Você só dá ou retira o que também tem, e não muda a própria conta.
        </p>
      </div>

      <div className="space-y-3">
        {staff.map((s) => {
          const perms = effectiveBoPermissions(s);
          const fromRole = new Set(BO_ROLE_DEFAULTS[s.role as BoRole] ?? []);
          const self = s.id === me.id;
          const outranks = [...perms].some((p) => !mine.has(p));
          return (
            <Card key={s.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {s.name}
                      {self ? <span className="text-xs text-muted-foreground"> (você)</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.username} · último acesso {s.lastLoginAt ? formatDateTimeBR(s.lastLoginAt) : "nunca"}
                    </p>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="secondary">{BO_ROLE_LABELS[s.role as BoRole] ?? s.role}</Badge>
                      {s.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Desativado</Badge>}
                      {s.mustChangePassword ? <Badge variant="warning">Senha provisória</Badge> : null}
                      {s.permsGranted.length || s.permsDenied.length ? <Badge variant="outline">Permissões ajustadas</Badge> : null}
                    </span>
                  </div>
                  {!self && !outranks ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionForm action={updateStaffAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="op" value="role" />
                        <Label htmlFor={`role-${s.id}`} className="sr-only">
                          Papel de {s.name}
                        </Label>
                        <Select id={`role-${s.id}`} name="role" defaultValue={s.role} className="h-9 w-auto">
                          {BO_ROLES.filter((r) => BO_ROLE_DEFAULTS[r].every((p) => mine.has(p))).map((r) => (
                            <option key={r} value={r}>
                              {BO_ROLE_LABELS[r]}
                            </option>
                          ))}
                        </Select>
                        <Button type="submit" variant="ghost" size="sm">
                          Mudar papel
                        </Button>
                      </ActionForm>
                      <ActionForm action={updateStaffAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="op" value="toggle" />
                        <Button type="submit" variant="outline" size="sm">
                          {s.active ? "Desativar" : "Reativar"}
                        </Button>
                      </ActionForm>
                    </div>
                  ) : null}
                </div>

                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand">
                    Permissões · {perms.size} de {ALL_BO_PERMISSIONS.length}
                  </summary>
                  <ActionForm action={updateStaffAction} className="mt-3 space-y-4">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="op" value="perms" />
                    {GROUPS.map((g) => (
                      <fieldset key={g} className="space-y-1.5">
                        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</legend>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {ALL_BO_PERMISSIONS.filter((p) => BO_PERMISSIONS[p].group === g).map((p) => {
                            const locked = self || outranks || !mine.has(p);
                            return (
                              <label key={p} className={`flex items-start gap-2 text-sm ${locked ? "opacity-60" : ""}`}>
                                <input type="checkbox" name="perm" value={p} defaultChecked={perms.has(p)} disabled={locked} className="mt-0.5 h-4 w-4 accent-primary" />
                                {/* Desabilitado não vai no formulário: repete o valor atual. */}
                                {locked && perms.has(p) ? <input type="hidden" name="perm" value={p} /> : null}
                                <span>
                                  {BO_PERMISSIONS[p].label}
                                  {fromRole.has(p) ? <span className="text-xs text-muted-foreground"> · do papel</span> : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                    {!self && !outranks ? (
                      <Button type="submit" size="sm" variant="outline">
                        Salvar permissões
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {self ? "Suas permissões só mudam por outra pessoa da equipe." : "Essa pessoa tem permissões que você não tem."}
                      </p>
                    )}
                  </ActionForm>
                </details>

                {!self ? (
                  <details>
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
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Adicionar pessoa</CardTitle>
          <CardDescription>
            Ela entra com a senha provisória e define a própria no primeiro acesso. Escolha o papel mais próximo; ajuste as permissões depois.
          </CardDescription>
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
                {BO_ROLES.filter((r) => BO_ROLE_DEFAULTS[r].every((p) => mine.has(p))).map((r) => (
                  <option key={r} value={r}>
                    {BO_ROLE_LABELS[r]}
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
