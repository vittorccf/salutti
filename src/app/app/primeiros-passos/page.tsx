import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CalendarPlus, Check, ClipboardList, Plug, Stethoscope, UserPlus } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { onboardingProgress } from "@/lib/onboarding";
import { libraryFor } from "@/lib/anamnesis-library";
import { ALL_COUNCILS, ALL_PROFESSIONAL_TYPES, AREAS, areaOf, professionalDefaults } from "@/lib/areas";
import { UFS } from "@/lib/labels";
import { getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { addLibraryTemplatesAction } from "../_actions/anamnesis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const professionalSchema = z.object({
  fullName: z.string().trim().min(2),
  professionalType: z.enum(ALL_PROFESSIONAL_TYPES),
  councilType: z.enum(ALL_COUNCILS),
  councilNumber: z.string().trim().optional(),
  councilUF: z.string().regex(/^\d{2}$/).optional().or(z.literal("")),
});

async function createFirstProfessionalAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = professionalSchema.parse(Object.fromEntries(formData.entries()));
  // Autônomo: um profissional ativo (reenvio do formulário não cria um segundo).
  if (ctx.workspace.accountType === "autonomo" && (await db.professional.count({ where: { workspaceId: ctx.workspace.id, active: true } })) > 0) {
    redirect("/app/primeiros-passos");
  }
  const noCouncil = data.councilType === "sem_registro";
  const created = await db.professional.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email: ctx.user.email,
      userId: ctx.user.id,
      birthDate: ctx.user.birthDate,
      professionalType: data.professionalType,
      noCouncil,
      councilType: data.councilType,
      councilNumber: noCouncil ? null : data.councilNumber || null,
      councilUF: noCouncil ? null : data.councilUF || null,
    },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "professional.create",
    entity: "Professional",
    entityId: created.id,
    metadata: { via: "onboarding" },
  });
  redirect("/app/primeiros-passos");
}

export default async function OnboardingPage() {
  const ctx = await requireContext();
  const [progress, templates] = await Promise.all([
    onboardingProgress(ctx.workspace.id),
    db.anamnesisTemplate.findMany({ where: { workspaceId: ctx.workspace.id }, select: { name: true } }),
  ]);
  const done = Object.fromEntries(progress.steps.map((s) => [s.key, s.done]));
  const defaults = professionalDefaults(ctx.workspace.segment);
  const area = areaOf(ctx.workspace.area);
  const { professionalTypes, councils } = AREAS[area];
  const added = new Set(templates.map((t) => t.name));
  const t = await getTranslations("dashboard.onboarding");
  const label = labeler(await getTranslations("common.labels"));
  const link = (href: string) => {
    const LinkChunk = (chunks: React.ReactNode) => (
      <Link href={href} className="text-brand underline-offset-4 hover:underline">
        {chunks}
      </Link>
    );
    return LinkChunk;
  };
  const stepLabels = { completed: t("completed"), optional: t("optional"), pending: t("pending") };

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("intro", { workspace: ctx.workspace.name })}
        </p>
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label={t("progressLabel")}
          >
            <div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span className="text-sm font-medium tabular-nums">
            {t("progress", { done: progress.done, total: progress.total })}
          </span>
        </div>
      </header>

      {progress.complete ? (
        <Card className="border-success/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-success-strong">{t("allSet")}</p>
              <p className="text-sm text-muted-foreground">{t("allSetHint")}</p>
            </div>
            <Button asChild>
              <Link href="/app">{t("goToDashboard")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Step n={1} done title={t("step1")} labels={stepLabels} icon={<Check className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          {t.rich("step1Body", {
            workspace: ctx.workspace.name,
            segment: label("segment", ctx.workspace.segment),
            link: link("/app/ajustes"),
          })}
        </p>
      </Step>

      <Step n={2} done={done.profissional} title={t("step2")} labels={stepLabels} icon={<Stethoscope className="h-5 w-5" />}>
        {done.profissional ? (
          <p className="text-sm text-muted-foreground">
            {t.rich("step2Done", { link: link("/app/equipe") })}
          </p>
        ) : (
          <form action={createFirstProfessionalAction} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fullName">{t("fullName")}</Label>
              <Input id="fullName" name="fullName" defaultValue={ctx.user.name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="professionalType">{t("profession")}</Label>
              <Select id="professionalType" name="professionalType" defaultValue={defaults.type}>
                {professionalTypes.map((p) => (
                  <option key={p} value={p}>
                    {label("professionalType", p)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="councilType">{t("council")}</Label>
              <Select id="councilType" name="councilType" defaultValue={defaults.council}>
                {councils.map((c) => (
                  <option key={c} value={c}>
                    {c === "sem_registro" ? t("noCouncil") : c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="councilNumber">{t("councilNumber")}</Label>
              <Input id="councilNumber" name="councilNumber" placeholder="06/12345" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="councilUF">{t("councilUF")}</Label>
              <Select id="councilUF" name="councilUF" defaultValue="">
                <option value="">{t("select")}</option>
                {UFS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.sigla}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
              {t("createProfessional")}
            </Button>
          </form>
        )}
      </Step>

      <Step n={3} done={done.anamnese} title={t("step3")} labels={stepLabels} icon={<ClipboardList className="h-5 w-5" />}>
        <form action={addLibraryTemplatesAction} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {libraryFor(area).map((lib) => {
              const isAdded = added.has(lib.name);
              return (
                <label
                  key={lib.slug}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 text-sm hover:bg-accent/40",
                    isAdded && "cursor-default opacity-70 hover:bg-transparent",
                  )}
                >
                  <input
                    type="checkbox"
                    name="slug"
                    value={lib.slug}
                    disabled={isAdded}
                    defaultChecked={isAdded || lib.defaultFor.includes(ctx.workspace.segment)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      {lib.name}
                      {isAdded ? <Badge variant="success">{t("added")}</Badge> : null}
                    </span>
                    <span className="block text-muted-foreground">{lib.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <Button type="submit" variant={done.anamnese ? "outline" : "default"}>
            {t("addTemplates")}
          </Button>
        </form>
      </Step>

      <Step n={4} done={false} optional title={t("step4")} labels={stepLabels} icon={<Plug className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          {t("step4Body")}
        </p>
        <Button variant="outline" size="sm" asChild className="mt-3">
          <Link href="/app/ajustes">{t("openSettings")}</Link>
        </Button>
      </Step>

      <Step n={5} done={done.paciente} title={t("step5")} labels={stepLabels} icon={<UserPlus className="h-5 w-5" />}>
        {done.paciente ? (
          <p className="text-sm text-muted-foreground">{t("patientDone")}</p>
        ) : (
          <Button asChild>
            <Link href="/app/pacientes/novo">
              <UserPlus className="h-4 w-4" /> {t("createPatient")}
            </Link>
          </Button>
        )}
      </Step>

      <Step n={6} done={done.sessao} title={t("step6")} labels={stepLabels} icon={<CalendarPlus className="h-5 w-5" />}>
        {done.sessao ? (
          <p className="text-sm text-muted-foreground">{t("sessionDone")}</p>
        ) : (
          done.profissional && done.paciente ? (
            <Button asChild>
              <Link href="/app/agenda/novo">
                <CalendarPlus className="h-4 w-4" /> {t("scheduleSession")}
              </Link>
            </Button>
          ) : (
            <Button disabled variant="outline">
              <CalendarPlus className="h-4 w-4" /> {t("scheduleSession")}
            </Button>
          )
        )}
        {!done.sessao && (!done.profissional || !done.paciente) ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("scheduleBlocked")}</p>
        ) : null}
      </Step>
    </div>
  );
}

function Step({
  n,
  done,
  optional,
  title,
  labels,
  icon,
  children,
}: {
  n: number;
  done: boolean;
  optional?: boolean;
  title: string;
  labels: { completed: string; optional: string; pending: string };
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-content-center rounded-full",
            done ? "bg-success/10 text-success-strong" : "bg-accent text-accent-foreground",
          )}
          aria-hidden
        >
          {done ? <Check className="h-5 w-5" /> : icon}
        </span>
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="text-muted-foreground tabular-nums">{n}.</span> {title}
            {done ? <Badge variant="success">{labels.completed}</Badge> : optional ? <Badge variant="muted">{labels.optional}</Badge> : null}
          </CardTitle>
          <CardDescription className="sr-only">{done ? labels.completed : labels.pending}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="sm:pl-[5.5rem]">{children}</CardContent>
    </Card>
  );
}
