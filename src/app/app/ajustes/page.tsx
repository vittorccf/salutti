import { supportMailto } from "@/lib/contact";
import { autonomoBlockers } from "@/lib/account";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Settings, KeyRound, CreditCard, Plug } from "lucide-react";
import { getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { videoStatus } from "@/lib/providers/video";
import { ANAMNESIS_LIBRARY } from "@/lib/anamnesis-library";
import { addLibraryTemplatesAction } from "../_actions/anamnesis";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PLANS, billingConfigured, type PaidPlan } from "@/lib/providers/billing";
import { billingPortalAction, subscribeAction } from "../_actions/billing";
import { changeAccountTypeAction, updateProfileAction, updateWorkspaceAction } from "../_actions/account";
import { ActionForm } from "@/components/forms/action-form";
import { AddressFields } from "@/components/forms/address-fields";
import { Input } from "@/components/ui/input";
import { isAccountType } from "@/lib/account";
import { dateKeySP } from "@/lib/dates";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import { ImageUpload } from "@/components/forms/image-upload";
import { googleOAuthConfigured } from "@/lib/providers/google-oauth";
import { disconnectGoogleAction } from "../_actions/integrations";
import { mediaUrl } from "@/lib/media";

export const dynamic = "force-dynamic";

// Avisos vindos por ?assinatura= e ?google= (texto em settings.page.notices.<grupo>.<código>).
const AVISOS: Record<string, "ok" | "erro"> = { ok: "ok", simulada: "ok", erro: "erro", "sem-permissao": "erro" };
const GOOGLE_AVISOS: Record<string, "ok" | "erro"> = {
  ok: "ok",
  desconectado: "ok",
  escopo: "erro",
  negado: "erro",
  erro: "erro",
  indisponivel: "erro",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ assinatura?: string; google?: string }> }) {
  const ctx = await requireContext();
  const { assinatura, google } = await searchParams;
  const t = await getTranslations("settings.page");
  const label = labeler(await getTranslations("common.labels"));
  const tLang = await getTranslations("common.language");
  const tCount = await getTranslations("common.count");
  const tAddress = await getTranslations("common.address");
  const tGeneral = t("templates.general");
  const googleAviso =
    google && Object.hasOwn(GOOGLE_AVISOS, google) ? { tone: GOOGLE_AVISOS[google], text: t(`notices.google.${google}`) } : null;
  const googleConn = await db.integrationConnection.findUnique({
    where: { userId_provider: { userId: ctx.user.id, provider: "google" } },
    select: { accountEmail: true, createdAt: true },
  });
  const aviso =
    assinatura && Object.hasOwn(AVISOS, assinatura) ? { tone: AVISOS[assinatura], text: t(`notices.subscription.${assinatura}`) } : null;
  const isOwner = ctx.role === "owner";
  const ws = ctx.workspace;
  const accountType = isAccountType(ws.accountType) ? ws.accountType : "autonomo";
  const isClinic = accountType === "clinica";
  const canEditWorkspace = ctx.role === "owner" || ctx.role === "admin";
  const [templates, activeProfessionals, members] = await Promise.all([
    db.anamnesisTemplate.findMany({ where: { workspaceId: ws.id } }),
    db.professional.count({ where: { workspaceId: ws.id, active: true } }),
    db.membership.count({ where: { workspaceId: ws.id, role: { notIn: ["receptionist", "financial"] } } }),
  ]);
  // Para virar autônomo, a conta precisa caber em um profissional e um usuário (mesma regra de autonomoBlockers).
  const blockers = isClinic
    ? autonomoBlockers({ activeProfessionals, members }).map((b) =>
        t(b.code === "professionals" ? "accountType.blockerProfessionals" : "accountType.blockerMembers", { count: b.count }),
      )
    : [];
  const clinic = String(isClinic);

  const integrations = [
    {
      name: "Stripe Billing",
      desc: t("integrations.stripe"),
      status: billingConfigured() ? "real" : "sandbox",
    },
    {
      name: "Zoom",
      desc: t("integrations.zoom"),
      status: videoStatus.zoom(),
    },
    {
      name: "Asaas / Iugu",
      desc: t("integrations.asaas"),
      status: process.env.ASAAS_API_KEY?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "NFE.io / Focus NF-e",
      desc: t("integrations.nfe"),
      status: process.env.NFEIO_API_KEY?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "WhatsApp Business (Meta)",
      desc: t("integrations.whatsapp"),
      status: process.env.WHATSAPP_BUSINESS_TOKEN?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "Receita Saúde (Receita Federal)",
      desc: t("integrations.receitaSaude"),
      status: process.env.RECEITA_SAUDE_TOKEN?.includes("mock") ? "sandbox" : "real",
    },
    {
      name: "OpenAI (Saluttin)",
      desc: t("integrations.openai"),
      status: process.env.OPENAI_API_KEY ? "real" : "heurístico",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <Settings className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("intro", { clinic })}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.title")}</CardTitle>
            <CardDescription>{t("profile.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfileAction} className="space-y-3">
              <ImageUpload
                name="avatar"
                label={t("profile.photo")}
                shape="square"
                currentUrl={mediaUrl(ctx.user.avatarId)}
                hint={t("profile.photoHint")}
              />
              <div className="space-y-1">
                <Label htmlFor="profile-name">{t("profile.name")}</Label>
                <Input id="profile-name" name="name" required defaultValue={ctx.user.name} autoComplete="name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-birthDate">{t("profile.birthday")}</Label>
                <Input id="profile-birthDate" name="birthDate" type="date" defaultValue={ctx.user.birthDate ? dateKeySP(ctx.user.birthDate) : ""} />
                <p className="text-xs text-muted-foreground">{t("profile.birthdayHint")}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="profile-locale">{tLang("label")}</Label>
                <Select id="profile-locale" name="locale" defaultValue={ctx.user.locale ?? ""}>
                  <option value="">{tLang("auto")}</option>
                  {LOCALES.map((l) => (
                    <option key={l} value={l} lang={l}>
                      {LOCALE_LABELS[l]}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">{tLang("hint")}</p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="showPatientBirthdays"
                  defaultChecked={ctx.user.showPatientBirthdays}
                  className="mt-0.5 h-4 w-4 accent-brand"
                />
                <span>
                  {t("profile.showPatientBirthdays")}
                  <span className="block text-xs text-muted-foreground">
                    {t("profile.showPatientBirthdaysHint")}
                  </span>
                </span>
              </label>
              <p className="text-xs text-muted-foreground">{t("profile.loginEmail", { email: ctx.user.email })}</p>
              <Button type="submit" variant="outline" size="sm">{t("profile.save")}</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="tipo-de-conta" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("accountType.title")}</CardTitle>
            <CardDescription>
              {t.rich("accountType.current", {
                type: label("accountType", accountType),
                segment: label("segment", ws.segment),
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{label("accountTypeDescription", accountType)}</p>
            {ctx.role !== "owner" ? (
              <p className="text-muted-foreground">{t("accountType.ownerOnly")}</p>
            ) : (
              <ActionForm action={changeAccountTypeAction} className="space-y-3">
                <input type="hidden" name="to" value={isClinic ? "autonomo" : "clinica"} />
                <p>
                  {isClinic ? t("accountType.toAutonomo") : t("accountType.toClinic")} {t("accountType.keeps")}
                </p>
                {isClinic ? (
                  <p className="rounded-md border p-3 text-muted-foreground">
                    {t("accountType.recordsWarning")}
                  </p>
                ) : null}
                {blockers.length ? (
                  <p className="rounded-md bg-warning/10 p-3 text-warning-strong">
                    {t("accountType.beforeChanging", { blockers: blockers.join("; ") })}
                  </p>
                ) : null}
                <Button type="submit" variant="outline" size="sm" disabled={blockers.length > 0}>
                  {isClinic ? t("accountType.changeToAutonomo") : t("accountType.changeToClinic")}
                </Button>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("workspace.title", { clinic })}</CardTitle>
            <CardDescription>
              {t("workspace.description", { slug: ws.slug })} <Badge>{label("planTier", ws.planTier)}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canEditWorkspace ? (
              <ActionForm action={updateWorkspaceAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="ws-name">{t("workspace.name", { clinic })}</Label>
                    <Input id="ws-name" name="name" required defaultValue={ws.name} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ws-cnpj">{isClinic ? t("workspace.cnpj") : t("workspace.cnpjOptional")}</Label>
                    <Input id="ws-cnpj" name="cnpj" defaultValue={ws.cnpj ?? ""} placeholder="00.000.000/0000-00" autoCapitalize="characters" />
                  </div>
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{tAddress("legend")}</legend>
                  <AddressFields idPrefix="ws-" defaultValue={ws} />
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">{t("workspace.menuTop")}</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {[
                      { v: "salutti", l: t("workspace.brandSalutti") },
                      { v: "photo", l: t("workspace.brandPhoto") },
                      { v: "banner", l: t("workspace.banner", { clinic }) },
                    ].map((o) => (
                      <label key={o.v} className="flex items-center gap-2">
                        <input type="radio" name="brandDisplay" value={o.v} defaultChecked={ws.brandDisplay === o.v} className="h-4 w-4 accent-brand" />
                        {o.l}
                      </label>
                    ))}
                  </div>
                  <ImageUpload
                    name="banner"
                    label={t("workspace.banner", { clinic })}
                    shape="banner"
                    currentUrl={mediaUrl(ws.bannerId)}
                    hint={t("workspace.bannerHint")}
                  />
                </fieldset>
                <Button type="submit" variant="outline" size="sm">{t("workspace.save")}</Button>
              </ActionForm>
            ) : (
              <div className="space-y-1 text-sm">
                <p><strong>{t("workspace.nameLabel")}</strong> {ws.name}</p>
                <p><strong>{t("workspace.cnpjLabel")}</strong> {ws.cnpj ?? "-"}</p>
                <p className="text-muted-foreground">{t("workspace.readOnly")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="conexoes" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-brand" aria-hidden /> Google Meet
            </CardTitle>
            <CardDescription>
              {t("google.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {googleAviso ? (
              <p
                role={googleAviso.tone === "erro" ? "alert" : "status"}
                className={
                  googleAviso.tone === "erro"
                    ? "rounded-md bg-destructive/10 p-3 text-destructive-strong"
                    : "rounded-md bg-success/10 p-3 text-success-strong"
                }
              >
                {googleAviso.text}
              </p>
            ) : null}
            {googleConn ? (
              <>
                <p>
                  <StatusBadge kind="integration" status="real" /> {t("google.connectedAs")}{" "}
                  <strong>{googleConn.accountEmail ?? t("google.googleAccount")}</strong>
                </p>
                {googleConn.accountEmail && googleConn.accountEmail.toLowerCase() !== ctx.user.email.toLowerCase() ? (
                  <p className="rounded-md bg-warning/10 p-3 text-warning-strong">
                    {t("google.otherAccount", { email: googleConn.accountEmail })}
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  {t("google.privacy")}
                </p>
                <form action={disconnectGoogleAction}>
                  <Button type="submit" variant="outline" size="sm">{t("google.disconnect")}</Button>
                </form>
              </>
            ) : null}
            {googleOAuthConfigured() ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("google.tipRecording")}</li>
                <li>{t("google.tipEpsi")}</li>
                <li>{t("google.tipWorkspace")}</li>
              </ul>
            ) : null}
            {googleConn ? null : googleOAuthConfigured() ? (
              <>
                <p className="text-muted-foreground">
                  {t("google.permissionHint")}
                </p>
                <Button size="sm" asChild>
                  {/* Navegação completa (não prefetch): a rota redireciona para o Google. */}
                  <a href="/api/integracoes/google/iniciar">{t("google.connect")}</a>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                <StatusBadge kind="integration" status="sandbox" /> {t("google.notEnabled")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand" aria-hidden /> {t("certificate.title")}
            </CardTitle>
            <CardDescription>{t("certificate.description")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{t("certificate.status")} <StatusBadge kind="integration" status="sandbox" /></p>
            <p className="text-muted-foreground mt-1">
              {t("certificate.hint")}
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-brand" aria-hidden /> {t("integrations.title")}
            </CardTitle>
            <CardDescription>{t("integrations.description")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((i) => (
              <div key={i.name} className="rounded-md border bg-card p-3">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-sm">{i.name}</p>
                  <StatusBadge kind="integration" status={i.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{i.desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("templates.title")}</CardTitle>
            <CardDescription>
              {t.rich("templates.description", {
                count: tCount("templates", { count: templates.length }),
                code: (chunks) => <code>{chunks}</code>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center gap-2">
                  <Badge variant="outline">{tpl.specialty ?? tGeneral}</Badge>
                  <span>{tpl.name}</span>
                  {tpl.isDefault ? <Badge variant="success">{t("templates.default")}</Badge> : null}
                </li>
              ))}
            </ul>
            <form action={addLibraryTemplatesAction} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="back" value="ajustes" />
              <div className="space-y-1">
                <Label htmlFor="slug">{t("templates.library")}</Label>
                <Select id="slug" name="slug" className="w-auto">
                  {ANAMNESIS_LIBRARY.filter((lib) => !templates.some((x) => x.name === lib.name)).map((lib) => (
                    <option key={lib.slug} value={lib.slug}>
                      {lib.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="outline" disabled={ANAMNESIS_LIBRARY.every((lib) => templates.some((x) => x.name === lib.name))}>
                {t("templates.add")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-brand" aria-hidden /> {t("plan.title")}
            </CardTitle>
            <CardDescription>
              {t.rich("plan.current", {
                plan: label("planTier", ctx.workspace.planTier),
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })}
              {billingConfigured() ? t("plan.stripe") : t("plan.stripeTest")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {aviso ? (
              <p
                role={aviso.tone === "erro" ? "alert" : "status"}
                className={
                  aviso.tone === "erro"
                    ? "rounded-md bg-destructive/10 p-3 text-destructive-strong"
                    : "rounded-md bg-success/10 p-3 text-success-strong"
                }
              >
                {aviso.text}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(PLANS) as PaidPlan[]).map((key) => {
                const p = PLANS[key];
                const current = ctx.workspace.planTier === key;
                return (
                  <div key={key} className={current ? "rounded-md border border-brand p-3" : "rounded-md border p-3"}>
                    <p className="font-semibold">
                      {p.name} · {t(`plan.${key}Price`)}
                    </p>
                    <p className="text-muted-foreground">{t(`plan.${key}Description`)}</p>
                    {current ? (
                      <Badge variant="success" className="mt-3">{t("plan.currentBadge")}</Badge>
                    ) : isOwner ? (
                      <form action={subscribeAction} className="mt-3">
                        <input type="hidden" name="plan" value={key} />
                        <Button type="submit" size="sm" variant={key === "pro" ? "default" : "outline"}>
                          {billingConfigured() ? t("plan.subscribe", { plan: p.name }) : t("plan.activateSimulated", { plan: p.name })}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              <div className="rounded-md border p-3">
                <p className="font-semibold">{t("plan.clinicTitle")}</p>
                <p className="text-muted-foreground">{t("plan.clinicDescription")}</p>
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <a href={supportMailto("Plano Clínica")}>{t("plan.contact")}</a>
                </Button>
              </div>
            </div>
            {isOwner && billingConfigured() && (ctx.workspace.planTier === "starter" || ctx.workspace.planTier === "pro") ? (
              <form action={billingPortalAction}>
                <Button type="submit" variant="outline" size="sm">
                  {t("plan.manage")}
                </Button>
              </form>
            ) : null}
            {!isOwner ? <p className="text-muted-foreground">{t("plan.ownerOnly")}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
