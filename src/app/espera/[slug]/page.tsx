import crypto from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { moduleEnabled } from "@/lib/areas";
import { ContactError, validEmail, validPhone } from "@/lib/contact-validation";
import { clientIp, isThrottled, registerFailure } from "@/lib/portal-auth";
import { canAdvertise, MODALITIES, PUBLIC_DAILY_CAP, REASON_MAX, SHIFTS, SOURCES, WEEKDAYS } from "@/lib/waitlist";
import { errorMessage } from "@/i18n/errors";
import { getTranslations } from "@/i18n/server";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { EmailInput } from "@/components/forms/email-input";
import { PhoneInput } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";

const SUBMISSIONS_PER_WINDOW = 5;
// Versão do texto de consentimento aceito (vai para a auditoria junto com a data).
const CONSENT_VERSION = "2026-10";

// Só abre com o formulário ligado, o módulo liberado e alguém que pode divulgar (nome e registro no conselho).
async function findList(slug: string) {
  const ws = await db.workspace.findUnique({
    where: { waitlistSlug: slug },
    include: { professionals: { where: { active: true }, select: { fullName: true, professionalType: true, councilType: true, councilNumber: true, noCouncil: true }, orderBy: { fullName: "asc" } } },
  });
  if (!ws || !ws.waitlistPublic || !moduleEnabled(ws, "lista_espera")) return null;
  const professionals = ws.professionals.filter(canAdvertise);
  return professionals.length ? { ...ws, professionals } : null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const ws = await findList(params.slug);
  const t = await getTranslations("waitlist.public");
  return { title: ws ? t("metaTitle", { workspace: ws.name }) : t("metaTitleGeneric"), robots: { index: false } };
}

// Inscrição pública: dados mínimos, consentimento específico, armadilha anti-robô e limite por IP.
async function joinAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  "use server";
  const t = await getTranslations("waitlist.public");
  const slug = String(fd.get("slug") ?? "");
  const ws = await findList(slug);
  if (!ws) return { erro: t("closed") };
  // Campo invisível: gente não preenche, robô sim. Finge sucesso para o robô não insistir.
  if (String(fd.get("website") ?? "")) redirect(`/espera/${slug}?ok=1`);
  // Conta antes de validar (envios em paralelo não passam do limite) e confere depois.
  const ipKey = `waitlist:${crypto.createHash("sha256").update(clientIp()).digest("hex").slice(0, 40)}`;
  await registerFailure(ipKey);
  if (await isThrottled(ipKey, SUBMISSIONS_PER_WINDOW + 1)) return { erro: t("tooMany") };
  // Teto por consultório: trocar de IP não lota a lista de ninguém.
  const today = await db.waitlistEntry.count({ where: { workspaceId: ws.id, createdVia: "formulario", createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
  if (today >= PUBLIC_DAILY_CAP) return { erro: t("tooMany") };
  const str = (k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
  const fullName = str("fullName", 120);
  if (fullName.length < 2) return { erro: t("nameRequired") };
  let phone: string | null, email: string | null;
  try {
    phone = validPhone(fd.get("phone"), { country: fd.get("phoneCountry") });
    email = await validEmail(fd.get("email"));
  } catch (e) {
    if (e instanceof ContactError) return { erro: await errorMessage(e) };
    throw e;
  }
  if (!phone && !email) return { erro: t("contactRequired") };
  if (fd.get("consent") !== "on") return { erro: t("consentRequired") };
  const isMinor = fd.get("isMinor") === "on";
  const guardianName = isMinor ? str("guardianName", 120) : "";
  if (isMinor && guardianName.length < 2) return { erro: t("guardianRequired") };
  const urgent = fd.get("urgent") === "on";
  const pick = <T extends readonly string[]>(list: T, v: string, d: T[number]) => ((list as readonly string[]).includes(v) ? v : d);
  const entry = await db.waitlistEntry.create({
    data: {
      workspaceId: ws.id,
      fullName,
      phone,
      email,
      isMinor,
      guardianName: guardianName || null,
      reason: str("reason", REASON_MAX) || null,
      modality: pick(MODALITIES, str("modality"), "indiferente"),
      preferredDays: fd.getAll("days").map(String).filter((d) => (WEEKDAYS as readonly string[]).includes(d)),
      preferredShifts: fd.getAll("shifts").map(String).filter((s) => (SHIFTS as readonly string[]).includes(s)),
      source: pick(SOURCES, str("source"), "outro"),
      urgent,
      createdVia: "formulario",
      consentAt: new Date(),
    },
  });
  await recordAudit({ workspaceId: ws.id, userId: null, action: "waitlist.public-join", entity: "WaitlistEntry", entityId: entry.id, metadata: { urgent, consentVersion: CONSENT_VERSION } });
  redirect(`/espera/${slug}?ok=1${urgent ? "&urgente=1" : ""}`);
}

export default async function PublicWaitlistPage({ params, searchParams }: { params: { slug: string }; searchParams: { ok?: string; urgente?: string } }) {
  const ws = await findList(params.slug);
  if (!ws) notFound();
  const [t, tw, tc] = await Promise.all([getTranslations("waitlist.public"), getTranslations("waitlist"), getTranslations("common.labels")]);
  const crisis = (
    <p role="note" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {t("crisis")}
    </p>
  );

  return (
    <main className="ds2-glow flex min-h-screen flex-col items-center px-4 py-10">
      <BrandLogo height={28} />
      <div className="mt-8 w-full max-w-lg space-y-4">
        {searchParams.ok ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("doneTitle")}</CardTitle>
              <CardDescription>{t("doneDescription", { workspace: ws.name })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {ws.waitlistEstimate ? <p>{t("estimate", { estimate: ws.waitlistEstimate })}</p> : null}
              <p className="text-muted-foreground">{t("noGuarantee")}</p>
              {searchParams.urgente ? crisis : null}
            </CardContent>
          </Card>
        ) : (
          <>
            {crisis}
            <Card>
              <CardHeader>
                <CardTitle>{t("title", { workspace: ws.name })}</CardTitle>
                <CardDescription>{ws.waitlistIntro || t("intro")}</CardDescription>
                <ul className="text-sm" aria-label={t("whoLabel")}>
                  {ws.professionals.map((p) => (
                    <li key={p.fullName}>
                      <span className="font-medium">{p.fullName}</span> · {tc(`professionalType.${p.professionalType}`)}
                      {p.noCouncil || !p.councilNumber ? "" : ` · ${p.councilType} ${p.councilNumber}`}
                    </li>
                  ))}
                </ul>
                {ws.waitlistEstimate ? <p className="text-sm font-medium">{t("estimate", { estimate: ws.waitlistEstimate })}</p> : null}
              </CardHeader>
              <CardContent>
                <ActionForm action={joinAction} className="space-y-4">
                  <input type="hidden" name="slug" value={params.slug} />
                  {/* Armadilha anti-robô: escondida de pessoas e de leitores de tela. */}
                  <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Website
                      <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">{tw("form.name")}</Label>
                    <Input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="name" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">{t("phone")}</Label>
                      <PhoneInput id="phone" name="phone" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">{tw("form.email")}</Label>
                      <EmailInput id="email" name="email" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
                  <div className="group space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isMinor" className="h-4 w-4 accent-primary" />
                      {t("isMinor")}
                    </label>
                    <div className="hidden space-y-1.5 rounded-lg border p-3 group-has-[input[name=isMinor]:checked]:block">
                      <p className="text-xs text-muted-foreground">{t("minorNotice")}</p>
                      <Label htmlFor="guardianName">{tw("form.guardian")}</Label>
                      <Input id="guardianName" name="guardianName" maxLength={120} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="modality">{tw("form.modality")}</Label>
                    <Select id="modality" name="modality" defaultValue="indiferente">
                      {MODALITIES.map((m) => (
                        <option key={m} value={m}>{tw(`modality.${m}`)}</option>
                      ))}
                    </Select>
                  </div>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">{tw("form.days")}</legend>
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAYS.map((d) => (
                        <label key={d} className="flex items-center gap-1 text-sm">
                          <input type="checkbox" name="days" value={d} className="h-4 w-4 accent-primary" />
                          {tw(`days.${d}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium">{tw("form.shifts")}</legend>
                    <div className="flex flex-wrap gap-3">
                      {SHIFTS.map((s) => (
                        <label key={s} className="flex items-center gap-1 text-sm">
                          <input type="checkbox" name="shifts" value={s} className="h-4 w-4 accent-primary" />
                          {tw(`shifts.${s}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor="reason">{t("reason")}</Label>
                    <Input id="reason" name="reason" maxLength={REASON_MAX} aria-describedby="reason-hint" />
                    <p id="reason-hint" className="text-xs text-muted-foreground">{t("reasonHint")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="source">{t("source")}</Label>
                    <Select id="source" name="source" defaultValue="">
                      <option value="">{t("sourceNone")}</option>
                      {SOURCES.map((s) => (
                        <option key={s} value={s}>{tw(`sources.${s}`)}</option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <input type="checkbox" name="urgent" className="mt-0.5 h-4 w-4 accent-primary" />
                    <span>{t("urgent")}</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-primary" />
                    <span>
                      {t("consent", { workspace: ws.name })} {t("consentMinor")}{" "}
                      <Link href="/privacidade" target="_blank" className="text-brand underline-offset-4 hover:underline">{t("privacy")}</Link>
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground">{t("noGuarantee")}</p>
                  <Button type="submit" className="w-full">{t("submit")}</Button>
                </ActionForm>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
