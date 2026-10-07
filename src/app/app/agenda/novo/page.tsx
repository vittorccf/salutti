import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateKeySP, parseDateOnly, parseDateTimeLocal, toDateTimeLocalSP } from "@/lib/dates";
import { assertInWorkspace } from "@/lib/tenant";
import { createSessionMeeting, MeetAccountError, type MeetIssue } from "@/lib/video-connections";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { assertInsurancePlan } from "@/lib/tenant";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { moduleEnabled } from "@/lib/areas";
import { isDateTimeLocal } from "@/lib/procedures";
import { ProcedurePicker } from "@/app/app/procedimentos/_components/procedure-picker";
import { notFound } from "next/navigation";

const schema = z.object({
  patientId: z.string(),
  professionalId: z.string(),
  startsAt: z.string(),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  modality: z.enum(["presencial", "online"]),
  price: z.coerce.number().min(0),
  notes: z.string().optional(),
  generateCharge: z.string().optional(),
  videoProvider: z.enum(["google_meet", "zoom", "none"]).default("google_meet"),
  billing: z.string().default("particular"), // "particular" ou id do convênio
  procedureId: z.string().optional(), // só na área com o módulo de procedimentos (Salutti Estética)
});


async function createAppointmentAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const data = schema.parse(Object.fromEntries(formData.entries()));
  await assertInWorkspace(ctx.workspace.id, { patientId: data.patientId, professionalId: data.professionalId });
  // Área sem módulo de convênios (estética): só particular, mesmo que o formulário traga outro valor.
  const insurancePlanId = data.billing !== "particular" && moduleEnabled(ctx.workspace.area, "convenios") ? data.billing : null;
  if (insurancePlanId) await assertInsurancePlan(ctx.workspace.id, insurancePlanId);
  const procedureId = moduleEnabled(ctx.workspace.area, "procedimentos") && data.procedureId ? data.procedureId : null;
  if (procedureId && (await db.procedure.count({ where: { id: procedureId, workspaceId: ctx.workspace.id } })) === 0) notFound();
  // Pelo convênio, vale o valor contratado com a operadora.
  const plan = insurancePlanId ? await db.insurancePlan.findUnique({ where: { id: insurancePlanId } }) : null;
  const price = plan ? plan.sessionPrice : data.price;
  const startsAt = parseDateTimeLocal(data.startsAt);
  const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60_000);
  let meeting: { url: string; eventId: string | null; ownerId: string | null } | null = null;
  let videoIssue: MeetIssue | null = null;
  if (data.modality === "online" && data.videoProvider !== "none") {
    try {
      meeting = await createSessionMeeting({
        workspaceId: ctx.workspace.id,
        professionalId: data.professionalId,
        userId: ctx.user.id,
        provider: data.videoProvider,
        // Título genérico: nome do paciente não vai para Google/Zoom (dado de saúde, LGPD).
        topic: (await getTranslations("schedule.form"))("meetingTopic"),
        startsAt,
        durationMinutes: data.durationMinutes,
      });
    } catch (e) {
      // A sessão é criada mesmo assim; o link pode ser gerado depois na tela da sessão.
      if (e instanceof MeetAccountError) videoIssue = e.issue;
      else {
        console.error("[video] falha ao criar reunião", e);
        videoIssue = "video";
      }
    }
  }

  const appointment = await db.appointment.create({
    data: {
      workspaceId: ctx.workspace.id,
      patientId: data.patientId,
      professionalId: data.professionalId,
      startsAt,
      endsAt,
      modality: data.modality,
      meetingUrl: meeting?.url ?? null,
      meetingEventId: meeting?.eventId ?? null,
      meetingOwnerId: meeting?.ownerId ?? null,
      price,
      insurancePlanId,
      procedureId,
      notes: data.notes || null,
    },
  });

  // Sessão por convênio é paga pela operadora (lote TISS), não gera cobrança Pix.
  if (data.generateCharge === "on" && !insurancePlanId) {
    // Cobrança da sessão vence no dia da sessão (campo só de data).
    const due = parseDateOnly(dateKeySP(startsAt));
    const { pix } = await import("@/lib/providers/pix");
    const txid = pix.generateChargeId();
    const charge = await db.charge.create({
      data: {
        workspaceId: ctx.workspace.id,
        patientId: data.patientId,
        appointmentId: appointment.id,
        amount: data.price,
        method: "pix",
        dueDate: due,
        pixCopyPaste: pix.generateCopyPaste(data.price, txid),
        externalId: txid,
      },
    });
    await db.paymentLink.create({
      data: {
        workspaceId: ctx.workspace.id,
        chargeId: charge.id,
        token: txid,
        url: `/pay/${txid}`,
      },
    });
  }

  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "appointment.create",
    entity: "Appointment",
    entityId: appointment.id,
  });

  redirect(`/app/agenda/${appointment.id}${videoIssue ? `?aviso=${videoIssue}` : ""}`);
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; procedureId?: string; startsAt?: string }>;
}) {
  const ctx = await requireContext();
  const t = await getTranslations("schedule.form");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));
  const params = await searchParams;
  // Salutti Estética: campo "Procedimento" e pré-preenchimento do retorno (paciente, procedimento e data).
  const aesthetic = moduleEnabled(ctx.workspace.area, "procedimentos");
  const procedures = aesthetic
    ? await db.procedure.findMany({
        where: { workspaceId: ctx.workspace.id, active: true },
        select: { id: true, name: true, durationMinutes: true, price: true },
        orderBy: { name: "asc" },
      })
    : [];
  const prefilled = procedures.find((p) => p.id === params.procedureId) ?? null;
  const [patients, professionals, plans] = await Promise.all([
    db.patient.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null, active: true },
      orderBy: { fullName: "asc" },
    }),
    db.professional.findMany({
      where: { workspaceId: ctx.workspace.id, active: true },
      orderBy: { fullName: "asc" },
    }),
    db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  const defaultDate = aesthetic && isDateTimeLocal(params.startsAt) ? params.startsAt : (() => {
    // Próxima hora cheia, no horário de São Paulo.
    const d = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
    return toDateTimeLocalSP(d);
  })();


  if (professionals.length === 0 || patients.length === 0) {
    return (
      <div className="max-w-2xl">
        <EmptyState
          icon={<CalendarPlus className="h-6 w-6" />}
          title={professionals.length === 0 ? t("noProfessionalTitle") : t("noPatientTitle")}
          description={
            professionals.length === 0 ? t("noProfessionalDescription") : t("noPatientDescription")
          }
          action={
            <Button asChild>
              <Link href={professionals.length === 0 ? "/app/equipe" : "/app/pacientes/novo"}>
                {professionals.length === 0 ? t("addProfessional") : t("addPatient")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAppointmentAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="patientId">{t("patient")}</Label>
                <Select name="patientId" id="patientId" defaultValue={params.patientId ?? ""} required>
                  <option value="">{t("select")}</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              {aesthetic && procedures.length > 0 ? (
                <ProcedurePicker procedures={procedures} defaultValue={prefilled?.id} />
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="professionalId">{t("professional")}</Label>
                <Select name="professionalId" id="professionalId" required>
                  <option value="">{t("select")}</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.councilType}
                      {p.councilNumber ? ` ${p.councilNumber}` : ` - ${t("noCouncilNumber")}`})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="startsAt">{t("startsAt")}</Label>
                <Input type="datetime-local" name="startsAt" id="startsAt" defaultValue={defaultDate} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="durationMinutes">{t("duration")}</Label>
                <Input
                  type="number"
                  name="durationMinutes"
                  id="durationMinutes"
                  defaultValue={prefilled ? Math.min(240, Math.max(15, prefilled.durationMinutes)) : 50}
                  min={15}
                  max={240}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modality">{t("modality")}</Label>
                <Select name="modality" id="modality" defaultValue={aesthetic ? "presencial" : "online"}>
                  <option value="presencial">{label("modality", "presencial")}</option>
                  <option value="online">{label("modality", "online")}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="videoProvider">{t("video")}</Label>
                <Select name="videoProvider" id="videoProvider" defaultValue="google_meet">
                  <option value="google_meet">{t("videoMeet")}</option>
                  <option value="zoom">{t("videoZoom")}</option>
                  <option value="none">{t("videoNone")}</option>
                </Select>
              </div>
              {plans.length > 0 ? (
                <div className="space-y-1">
                  <Label htmlFor="billing">{t("billing")}</Label>
                  <Select name="billing" id="billing" defaultValue="particular">
                    <option value="particular">{t("private")}</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t("insuranceOption", { name: p.name, price: f.money(p.sessionPrice) })}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="price">{t("price")}</Label>
                <Input type="number" step="0.01" name="price" id="price" defaultValue={prefilled?.price ?? 180} required />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="notes">{t("notes")}</Label>
                <Input name="notes" id="notes" placeholder={t("optional")} />
              </div>
              <div className="sm:col-span-2 flex gap-2 items-center text-sm">
                <input id="generateCharge" name="generateCharge" type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
                <Label htmlFor="generateCharge">{t("generateCharge")}</Label>
              </div>
            </div>
            <Button type="submit">{t("submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
