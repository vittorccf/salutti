import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CalendarPlus, Check, ClipboardList, Plug, Stethoscope, UserPlus } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { onboardingProgress } from "@/lib/onboarding";
import { ANAMNESIS_LIBRARY } from "@/lib/anamnesis-library";
import { segmentLabel } from "@/lib/labels";
import { addLibraryTemplatesAction } from "../_actions/anamnesis";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tipo de profissional e conselho sugeridos pelo tipo de atendimento do cadastro.
const professionalDefaults = (segment: string) => {
  if (segment === "solo_psicanalista") return { type: "psicanalista", council: "sem_registro" };
  if (segment === "odonto" || segment === "ubs") return { type: "dentista", council: "CRO" };
  return { type: "psicologo", council: "CRP" };
};

const professionalSchema = z.object({
  fullName: z.string().trim().min(2),
  professionalType: z.enum(["psicologo", "psicanalista", "terapeuta", "psiquiatra", "dentista", "medico"]),
  councilType: z.enum(["CRP", "CRM", "CRO", "sem_registro"]),
  councilNumber: z.string().trim().optional(),
});

async function createFirstProfessionalAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = professionalSchema.parse(Object.fromEntries(formData.entries()));
  const noCouncil = data.councilType === "sem_registro";
  const created = await db.professional.create({
    data: {
      workspaceId: ctx.workspace.id,
      fullName: data.fullName,
      email: ctx.user.email,
      professionalType: data.professionalType,
      noCouncil,
      councilType: data.councilType,
      councilNumber: noCouncil ? null : data.councilNumber || null,
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
  const added = new Set(templates.map((t) => t.name));

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Primeiros passos</h1>
        <p className="text-muted-foreground">
          Deixe {ctx.workspace.name} pronto para atender. Leva poucos minutos e dá para voltar depois.
        </p>
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Progresso dos primeiros passos"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <span className="text-sm font-medium tabular-nums">
            {progress.done} de {progress.total}
          </span>
        </div>
      </header>

      {progress.complete ? (
        <Card className="border-success/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-success-strong">Tudo pronto</p>
              <p className="text-sm text-muted-foreground">Seu consultório está configurado. Bom trabalho!</p>
            </div>
            <Button asChild>
              <Link href="/app">Ir para o painel</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Step n={1} done title="Consultório criado" icon={<Check className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          {ctx.workspace.name} · {segmentLabel(ctx.workspace.segment)}. CNPJ e outros dados ficam em{" "}
          <Link href="/app/ajustes" className="text-primary-strong underline-offset-4 hover:underline">
            Ajustes
          </Link>
          .
        </p>
      </Step>

      <Step n={2} done={done.profissional} title="Cadastre quem atende" icon={<Stethoscope className="h-5 w-5" />}>
        {done.profissional ? (
          <p className="text-sm text-muted-foreground">
            Profissional cadastrado. Para incluir mais pessoas, use{" "}
            <Link href="/app/equipe" className="text-primary-strong underline-offset-4 hover:underline">
              Profissionais
            </Link>
            .
          </p>
        ) : (
          <form action={createFirstProfessionalAction} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="fullName">Nome de quem atende</Label>
              <Input id="fullName" name="fullName" defaultValue={ctx.user.name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="professionalType">Profissão</Label>
              <Select id="professionalType" name="professionalType" defaultValue={defaults.type}>
                <option value="psicologo">Psicólogo</option>
                <option value="psicanalista">Psicanalista</option>
                <option value="terapeuta">Terapeuta</option>
                <option value="psiquiatra">Psiquiatra</option>
                <option value="dentista">Dentista</option>
                <option value="medico">Médico</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="councilType">Conselho</Label>
              <Select id="councilType" name="councilType" defaultValue={defaults.council}>
                <option value="CRP">CRP</option>
                <option value="CRM">CRM</option>
                <option value="CRO">CRO</option>
                <option value="sem_registro">Sem registro de conselho</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="councilNumber">Número do registro (opcional)</Label>
              <Input id="councilNumber" name="councilNumber" placeholder="06/12345" />
            </div>
            <Button type="submit" className="sm:col-span-2 sm:justify-self-start">
              Cadastrar profissional
            </Button>
          </form>
        )}
      </Step>

      <Step n={3} done={done.anamnese} title="Escolha os modelos de anamnese" icon={<ClipboardList className="h-5 w-5" />}>
        <form action={addLibraryTemplatesAction} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {ANAMNESIS_LIBRARY.map((t) => {
              const isAdded = added.has(t.name);
              return (
                <label
                  key={t.slug}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-3 text-sm hover:bg-accent/40",
                    isAdded && "cursor-default opacity-70 hover:bg-transparent",
                  )}
                >
                  <input
                    type="checkbox"
                    name="slug"
                    value={t.slug}
                    disabled={isAdded}
                    defaultChecked={isAdded || t.defaultFor.includes(ctx.workspace.segment)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      {t.name}
                      {isAdded ? <Badge variant="success">Adicionado</Badge> : null}
                    </span>
                    <span className="block text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <Button type="submit" variant={done.anamnese ? "outline" : "default"}>
            Adicionar modelos selecionados
          </Button>
        </form>
      </Step>

      <Step n={4} done={false} optional title="Revise as integrações" icon={<Plug className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          Pix, nota fiscal, Google Meet e Zoom funcionam em modo de teste até você informar as chaves reais.
        </p>
        <Button variant="outline" size="sm" asChild className="mt-3">
          <Link href="/app/ajustes">Abrir Ajustes</Link>
        </Button>
      </Step>

      <Step n={5} done={done.paciente} title="Cadastre o primeiro paciente" icon={<UserPlus className="h-5 w-5" />}>
        {done.paciente ? (
          <p className="text-sm text-muted-foreground">Paciente cadastrado.</p>
        ) : (
          <Button asChild>
            <Link href="/app/pacientes/novo">
              <UserPlus className="h-4 w-4" /> Cadastrar paciente
            </Link>
          </Button>
        )}
      </Step>

      <Step n={6} done={done.sessao} title="Agende a primeira sessão" icon={<CalendarPlus className="h-5 w-5" />}>
        {done.sessao ? (
          <p className="text-sm text-muted-foreground">Sessão agendada.</p>
        ) : (
          done.profissional && done.paciente ? (
            <Button asChild>
              <Link href="/app/agenda/novo">
                <CalendarPlus className="h-4 w-4" /> Agendar sessão
              </Link>
            </Button>
          ) : (
            <Button disabled variant="outline">
              <CalendarPlus className="h-4 w-4" /> Agendar sessão
            </Button>
          )
        )}
        {!done.sessao && (!done.profissional || !done.paciente) ? (
          <p className="mt-2 text-xs text-muted-foreground">Antes, cadastre quem atende e o primeiro paciente.</p>
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
  icon,
  children,
}: {
  n: number;
  done: boolean;
  optional?: boolean;
  title: string;
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
            {done ? <Badge variant="success">Concluído</Badge> : optional ? <Badge variant="muted">Opcional</Badge> : null}
          </CardTitle>
          <CardDescription className="sr-only">{done ? "Concluído" : "Pendente"}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="sm:pl-[5.5rem]">{children}</CardContent>
    </Card>
  );
}
