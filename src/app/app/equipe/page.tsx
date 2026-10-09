import Link from "next/link";
import { errorMessage } from "@/i18n/errors";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { Stethoscope } from "lucide-react";
import { UFS } from "@/lib/labels";
import { ContactError, validEmail, validPhone } from "@/lib/contact-validation";
import { EmailInput } from "@/components/forms/email-input";
import { parseDateOnly } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { PhoneInput } from "@/components/forms/phone-input";
import { InviteForm } from "./_components/invite-form";
import { changeRoleAction, removeMemberAction, revokeInviteAction, saveMemberPermissionsAction } from "../_actions/team";
import { APP_PERMISSIONS, effectiveAppPermissions, lockedFor } from "@/lib/app-permissions";
import { rolesFor } from "@/lib/invitations";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { ALL_COUNCILS, ALL_PROFESSIONAL_TYPES, AREAS, areaOf, professionalDefaults } from "@/lib/areas";

export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().min(2),
  professionalType: z.enum(ALL_PROFESSIONAL_TYPES),
  noCouncil: z.string().optional(),
  councilType: z.enum(ALL_COUNCILS).optional().or(z.literal("")),
  councilNumber: z.string().optional(),
  councilUF: z.string().regex(/^\d{2}$/).optional().or(z.literal("")),
  specialty: z.string().optional(),
  hourlyRate: z.coerce.number().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  userId: z.string().optional(),
});

const canManage = (ctx: { permissions: Set<string> }) => ctx.permissions.has("equipe.gerenciar");

const activeCount = (workspaceId: string) => db.professional.count({ where: { workspaceId, active: true } });

async function createProfessionalAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const ctx = await requireContext();
  const t = await getTranslations("settings.team");
  if (!canManage(ctx)) return { erro: t("noPermission") };
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { erro: t("errors.invalid") };
  const data = parsed.data;
  if (ctx.workspace.accountType === "autonomo" && (await activeCount(ctx.workspace.id)) >= 1) return { erro: t("autonomoLimit") };
  // Limite do contrato (definido no backoffice).
  if (ctx.workspace.maxProfessionals !== null && (await activeCount(ctx.workspace.id)) >= ctx.workspace.maxProfessionals) {
    return { erro: t("contractLimit", { max: ctx.workspace.maxProfessionals }) };
  }
  // Vínculo com um usuário da Salutti (o Meet nasce na conta Google dele): precisa ser membro e não ter outro cadastro ativo.
  let userId: string | null = null;
  if (data.userId) {
    const member = await db.membership.findFirst({ where: { workspaceId: ctx.workspace.id, userId: data.userId } });
    const taken = await db.professional.count({ where: { workspaceId: ctx.workspace.id, userId: data.userId, active: true } });
    if (!member || taken) return { erro: t("errors.userLink") };
    userId = data.userId;
  }
  let email: string | null, phone: string | null;
  try {
    email = await validEmail(formData.get("email"));
    phone = validPhone(formData.get("phone"), { country: formData.get("phoneCountry") });
  } catch (e) {
    if (e instanceof ContactError) return { erro: await errorMessage(e) };
    throw e;
  }
  const noCouncil = data.noCouncil === "on";
  const created = await db.professional.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email,
      phone,
      professionalType: data.professionalType,
      noCouncil,
      councilType: noCouncil ? "sem_registro" : data.councilType || professionalDefaults(ctx.workspace.segment).council,
      councilNumber: noCouncil ? null : data.councilNumber || null,
      councilUF: noCouncil ? null : data.councilUF || null,
      specialty: data.specialty || null,
      hourlyRate: data.hourlyRate || null,
      birthDate: data.birthDate ? parseDateOnly(data.birthDate) : null,
      userId,
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "professional.create",
    entity: "Professional",
    entityId: created.id,
  });
  redirect("/app/equipe");
}

// Desativar mantém o histórico (sessões, evoluções); o profissional só some das listas de agendamento.
async function toggleProfessionalAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  if (!canManage(ctx)) redirect("/app/equipe?aviso=sem-permissao");
  const professionalId = String(formData.get("professionalId"));
  await assertInWorkspace(ctx.workspace.id, { professionalId });
  const current = await db.professional.findFirstOrThrow({ where: { id: professionalId, workspaceId: ctx.workspace.id } });
  if (!current.active && ctx.workspace.accountType === "autonomo" && (await activeCount(ctx.workspace.id)) >= 1) {
    redirect("/app/equipe?aviso=limite");
  }
  await db.professional.updateMany({
    where: { id: professionalId, workspaceId: ctx.workspace.id },
    data: { active: !current.active },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: current.active ? "professional.deactivate" : "professional.activate",
    entity: "Professional",
    entityId: professionalId,
  });
  revalidatePath("/app/equipe");
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const ctx = await requireContext();
  const professionals = await db.professional.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { appointments: true } } },
    orderBy: { createdAt: "desc" },
  });
  const autonomo = ctx.workspace.accountType === "autonomo";
  const linked = new Set(professionals.filter((p) => p.active && p.userId).map((p) => p.userId));
  const members = (
    await db.membership.findMany({ where: { workspaceId: ctx.workspace.id }, include: { user: { select: { id: true, name: true, email: true } } } })
  ).filter((m) => !linked.has(m.user.id));
  const active = professionals.filter((p) => p.active).length;
  const manage = canManage(ctx);
  const canAdd = manage && (!autonomo || active === 0);
  const t = await getTranslations("settings.team");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const ta = await getTranslations("settings.access");
  // Acessos à conta (quem entra no sistema) e convites pendentes; só dono e administrador veem e gerenciam.
  const [allMembers, invites] = manage
    ? await Promise.all([
        db.membership.findMany({
          where: { workspaceId: ctx.workspace.id },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        }),
        db.invitation.findMany({
          where: { workspaceId: ctx.workspace.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];
  const roles = rolesFor(ctx.workspace.accountType);
  // Profissões e conselhos oferecidos pela área do consultório (Salutti ou Salutti Estética).
  const { professionalTypes, councils } = AREAS[areaOf(ctx.workspace.area)];
  const defaults = professionalDefaults(ctx.workspace.segment);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {autonomo ? t("introAutonomo") : t("introClinic")}
        </p>
      </header>
      {aviso === "limite" || aviso === "sem-permissao" ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {aviso === "limite" ? t("autonomoLimit") : t("noPermission")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>
              {autonomo ? t("listAutonomo") : t("listClinic", { count: professionals.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("name")}</TH>
                  <TH>{t("specialty")}</TH>
                  <TH>{t("council")}</TH>
                  <TH className="text-right">{t("hourlyRate")}</TH>
                  <TH className="text-right">{t("sessions")}</TH>
                  <TH>{t("status")}</TH>
                  <TH><span className="sr-only">{t("actions")}</span></TH>
                </TR>
              </THead>
              <TBody>
                {professionals.length === 0 ? (
                  <TR>
                    <TD colSpan={7} className="text-center text-muted-foreground">
                      {t("empty")}
                    </TD>
                  </TR>
                ) : (
                  professionals.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.fullName}</TD>
                      <TD>{p.specialty ?? label("professionalType", p.professionalType)}</TD>
                      <TD>
                        {p.noCouncil ? (
                          <Badge variant="muted">{t("noCouncilBadge")}</Badge>
                        ) : (
                          `${p.councilType} ${p.councilNumber ?? ""}`
                        )}
                      </TD>
                      <TD className="text-right">{p.hourlyRate ? f.money(p.hourlyRate) : "-"}</TD>
                      <TD className="text-right">{f.number(p._count.appointments)}</TD>
                      <TD>
                        <Badge variant={p.active ? "success" : "muted"}>{p.active ? t("active") : t("inactive")}</Badge>
                      </TD>
                      <TD className="text-right">
                        {manage ? (
                        <form action={toggleProfessionalAction}>
                          <input type="hidden" name="professionalId" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost" aria-label={p.active ? t("deactivateLabel", { name: p.fullName }) : t("reactivateLabel", { name: p.fullName })}>
                            {p.active ? t("deactivate") : t("reactivate")}
                          </Button>
                        </form>
                        ) : null}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {!manage ? null : !canAdd ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("autonomoTitle")}</CardTitle>
              <CardDescription>
                {t("autonomoDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href="/app/ajustes#tipo-de-conta">{t("changeToClinic")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle>{autonomo ? t("formTitleAutonomo") : t("formTitleClinic")}</CardTitle>
            <CardDescription>{t("formDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createProfessionalAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="fullName">{t("fullName")}</Label>
                <Input name="fullName" id="fullName" required />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="professionalType">{t("type")}</Label>
                  <Select name="professionalType" id="professionalType" defaultValue={defaults.type}>
                    {professionalTypes.map((p) => (
                      <option key={p} value={p}>
                        {label("professionalType", p)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="specialty">{t("specialty")}</Label>
                  <Input name="specialty" id="specialty" placeholder={t("specialtyPlaceholder")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="userId">{t("userAccess")}</Label>
                <Select name="userId" id="userId" defaultValue={autonomo ? ctx.user.id : ""}>
                  <option value="">{t("noAccess")}</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} · {m.user.email}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">{t("userAccessHint")}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">{t("email")}</Label>
                <EmailInput name="email" id="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">{t("phone")}</Label>
                <PhoneInput name="phone" id="phone" />
              </div>
              <div className="rounded-md border p-2 text-sm flex items-center gap-2">
                <input id="noCouncil" name="noCouncil" type="checkbox" className="h-4 w-4 accent-brand" />
                <Label htmlFor="noCouncil">{t("noCouncil")}</Label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="councilType">{t("councilType")}</Label>
                  <Select name="councilType" id="councilType" defaultValue={defaults.council}>
                    {councils.map((c) => (
                      <option key={c} value={c}>
                        {c === "sem_registro" ? t("noCouncilBadge") : c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="councilNumber">{t("councilNumber")}</Label>
                  <Input name="councilNumber" id="councilNumber" placeholder="06/12345" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="councilUF">{t("councilUF")}</Label>
                <Select name="councilUF" id="councilUF" defaultValue="">
                  <option value="">{t("select")}</option>
                  {UFS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.sigla}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="hourlyRate">{t("hourlyRateField")}</Label>
                  <Input name="hourlyRate" id="hourlyRate" type="number" step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="birthDate">{t("birthday")}</Label>
                  <Input name="birthDate" id="birthDate" type="date" />
                </div>
              </div>
              <Button type="submit" className="w-full">{t("submit")}</Button>
            </ActionForm>
          </CardContent>
        </Card>
        )}
      </div>

      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle>{ta("title")}</CardTitle>
            <CardDescription>{autonomo ? ta("descriptionAutonomo") : ta("description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <div className="space-y-3">
              <ul className="divide-y rounded-md border">
                {allMembers.map((m) => {
                  const locked = m.role === "owner" || m.user.id === ctx.user.id || (m.role === "admin" && ctx.role !== "owner");
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      {locked ? (
                        <Badge variant="muted">{label("role", m.role)}</Badge>
                      ) : (
                        <>
                          <form action={changeRoleAction} className="flex items-center gap-1">
                            <input type="hidden" name="membershipId" value={m.id} />
                            <Select name="role" defaultValue={m.role} aria-label={ta("roleOf", { name: m.user.name })} className="h-8 w-auto text-xs">
                              {roles.filter((r) => r !== "admin" || ctx.role === "owner").map((r) => (
                                <option key={r} value={r}>
                                  {label("role", r)}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" size="sm" variant="ghost">{ta("saveRole")}</Button>
                          </form>
                          <form action={removeMemberAction}>
                            <input type="hidden" name="membershipId" value={m.id} />
                            <Button type="submit" size="sm" variant="ghost" aria-label={ta("removeOf", { name: m.user.name })}>
                              {ta("remove")}
                            </Button>
                          </form>
                          {/* Permissões do membro: padrão do papel + ajustes. Só o que você tem pode ser dado ou retirado. */}
                          <details className="w-full rounded-md border bg-muted/30 p-3">
                            <summary className="cursor-pointer text-xs font-medium text-brand">{ta("permissions.open", { name: m.user.name })}</summary>
                            <ActionForm action={saveMemberPermissionsAction} className="mt-3 space-y-3">
                              <input type="hidden" name="membershipId" value={m.id} />
                              <fieldset className="grid gap-2 sm:grid-cols-2">
                                <legend className="sr-only">{ta("permissions.legend", { name: m.user.name })}</legend>
                                {APP_PERMISSIONS.map((perm) => {
                                  const has = effectiveAppPermissions(m.role, m.permsGranted, m.permsDenied).has(perm);
                                  const fixed = lockedFor(m.role, perm);
                                  const notMine = !ctx.permissions.has(perm);
                                  return (
                                    <label key={perm} className={`flex items-start gap-2 text-xs ${fixed || notMine ? "opacity-60" : ""}`}>
                                      <input type="checkbox" name="perm" value={perm} defaultChecked={has} disabled={fixed || notMine} className="mt-0.5 h-4 w-4 accent-primary" />
                                      {/* Desabilitado não vai no formulário: repete o valor atual para não perder. */}
                                      {(fixed || notMine) && has ? <input type="hidden" name="perm" value={perm} /> : null}
                                      <span>
                                        {ta(`permissions.items.${perm}`)}
                                        {fixed ? <span className="block text-muted-foreground">{ta("permissions.clinicalFixed")}</span> : null}
                                      </span>
                                    </label>
                                  );
                                })}
                              </fieldset>
                              <Button type="submit" size="sm" variant="outline">
                                {ta("permissions.save")}
                              </Button>
                            </ActionForm>
                          </details>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {invites.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{ta("pending")}</p>
                  <ul className="divide-y rounded-md border">
                    {invites.map((inv) => (
                      <li key={inv.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {label("role", inv.role)} · {ta("expires", { date: f.date(inv.expiresAt) })}
                          </p>
                        </div>
                        <form action={revokeInviteAction}>
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <Button type="submit" size="sm" variant="ghost" aria-label={ta("revokeOf", { email: inv.email })}>
                            {ta("revoke")}
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <InviteForm roles={ctx.role === "owner" ? roles : roles.filter((r) => r !== "admin")} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
