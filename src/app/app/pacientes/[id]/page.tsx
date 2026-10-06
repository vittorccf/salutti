import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CalendarPlus, FilePlus2, Pencil, Receipt as ReceiptIcon, ShieldCheck, Smartphone } from "lucide-react";
import { differenceInYears } from "date-fns";
import { chargeDisplayStatus } from "@/lib/labels";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { recordAudit } from "@/lib/audit";
import { assertInWorkspace, assertInsurancePlan } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PhoneText } from "@/components/ui/phone";
import { formatAddress } from "@/lib/address";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

async function updateInsuranceAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = String(formData.get("patientId"));
  const insurancePlanId = String(formData.get("insurancePlanId") ?? "") || null;
  const card = String(formData.get("insuranceCardNumber") ?? "").trim().slice(0, 20) || null;
  await assertInWorkspace(ctx.workspace.id, { patientId });
  if (insurancePlanId) await assertInsurancePlan(ctx.workspace.id, insurancePlanId);
  await db.patient.updateMany({
    where: { id: patientId, workspaceId: ctx.workspace.id },
    data: { insurancePlanId, insuranceCardNumber: insurancePlanId ? card : null },
  });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "patient.insurance",
    entity: "Patient",
    entityId: patientId,
  });
  redirect(`/app/pacientes/${patientId}`);
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const patient = await db.patient.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null },
    include: {
      appointments: { include: { professional: true }, orderBy: { startsAt: "desc" }, take: 10 },
      clinicalNotes: { orderBy: { createdAt: "desc" }, take: 5 },
      charges: { orderBy: { dueDate: "desc" }, take: 10 },
      receipts: { orderBy: { issuedAt: "desc" }, take: 5 },
      consentRecords: true,
      portalAccess: true,
      dailyCards: { orderBy: { date: "desc" }, take: 7 },
      insurancePlan: true,
    },
  });
  if (!patient) notFound();
  const plans = await db.insurancePlan.findMany({ where: { workspaceId: ctx.workspace.id, active: true }, orderBy: { name: "asc" } });

  const totalPaid = patient.charges.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const totalOpen = patient.charges
    .filter((c) => c.status === "pending" || c.status === "overdue")
    .reduce((s, c) => s + c.amount, 0);
  const age = patient.birthDate ? differenceInYears(new Date(), patient.birthDate) : null;
  const [t, tActions, tLabels, f] = await Promise.all([
    getTranslations("patients.detail"),
    getTranslations("common.actions"),
    getTranslations("common.labels"),
    getFormat(),
  ]);
  const label = labeler(tLabels);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-start gap-4">
        <Avatar src={mediaUrl(patient.photoId)} name={patient.fullName} className="h-16 w-16 text-base" />
        <div>
          <h1 className="text-2xl font-bold">{t("title", { name: patient.fullName })}</h1>
          {age !== null ? <p className="text-sm text-muted-foreground">{t("age", { age })}</p> : null}
          {/* Contato e endereço recolhidos: a ficha costuma ficar aberta em telas compartilhadas (sigilo, art. 9º do Código de Ética). */}
          <details className="mt-1 text-sm text-muted-foreground">
            <summary className="cursor-pointer w-fit text-primary-strong">{t("showContact")}</summary>
            <div className="mt-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-x-1.5">
                <PhoneText value={patient.phone} fallback={t("noPhone")} />
                <span>· {patient.email ?? t("noEmail")}</span>
              </p>
              {formatAddress(patient) ? <p>{formatAddress(patient)}</p> : null}
              {patient.address ? <p>{t("legacyAddress", { address: patient.address })}</p> : null}
            </div>
          </details>
        </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <Link href={`/app/pacientes/${patient.id}/editar`}>
              <Pencil className="h-4 w-4" /> {tActions("edit")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/app/agenda/novo?patientId=${patient.id}`}>
              <CalendarPlus className="h-4 w-4" /> {t("schedule")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/app/financeiro/novo?patientId=${patient.id}`}>
              <ReceiptIcon className="h-4 w-4" /> {t("newCharge")}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/app/prontuario/${patient.id}/nova-evolucao`}>
              <FilePlus2 className="h-4 w-4" /> {t("newNote")}
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <SmallCard label={t("totalPaid")} value={f.money(totalPaid)} />
        <SmallCard label={t("totalOpen")} value={f.money(totalOpen)} tone="warn" />
        <SmallCard label={t("sessionsCount")} value={f.number(patient.appointments.length)} />
        <SmallCard label={t("notesCount")} value={f.number(patient.clinicalNotes.length)} />
      </div>

      {plans.length > 0 || patient.insurancePlan ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("insuranceTitle")}</CardTitle>
            <CardDescription>
              {patient.insurancePlan
                ? t("insuranceSummary", { plan: patient.insurancePlan.name, card: patient.insuranceCardNumber ?? t("cardMissing") })
                : t("privateCare")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateInsuranceAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="patientId" value={patient.id} />
              <div className="space-y-1">
                <Label htmlFor="insurancePlanId">{t("insurance")}</Label>
                <Select id="insurancePlanId" name="insurancePlanId" defaultValue={patient.insurancePlanId ?? ""} className="w-56">
                  <option value="">{t("private")}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="insuranceCardNumber">{t("card")}</Label>
                <Input id="insuranceCardNumber" name="insuranceCardNumber" defaultValue={patient.insuranceCardNumber ?? ""} maxLength={20} className="w-56" />
              </div>
              <Button type="submit" variant="outline">
                {t("saveInsurance")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Portal & Cartões Diários */}
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary-strong" aria-hidden /> {t("portalTitle")}
            </CardTitle>
            <CardDescription>
              {patient.portalAccess ? (
                <>
                  {t("portalLink")}{" "}
                  <Link className="text-primary-strong underline-offset-4 hover:underline" href={`/portal/${patient.portalAccess.token}`}>
                    /portal/{patient.portalAccess.token.slice(0, 8)}…
                  </Link>
                </>
              ) : (
                t("portalNotGranted")
              )}
            </CardDescription>
          </div>
          <form action={async () => {
            "use server";
            const ctx = await requireContext();
            const { randomToken } = await import("@/lib/utils");
            await db.patientPortalAccess.upsert({
              where: { patientId: patient.id },
              create: { patientId: patient.id, token: randomToken(32) },
              update: { active: true },
            });
            await import("@/lib/audit").then((m) =>
              m.recordAudit({
                workspaceId: ctx.workspace.id,
                userId: ctx.user.id,
                action: "portal.grant",
                entity: "Patient",
                entityId: patient.id,
              }),
            );
          }}>
            <Button size="sm" variant="outline" type="submit">
              {patient.portalAccess ? t("portalRenew") : t("portalGenerate")}
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {patient.dailyCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dailyCardsEmpty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {patient.dailyCards.map((d) => (
                <div key={d.id} className="rounded-md border p-2 text-center text-xs">
                  <p className="text-muted-foreground">{f.date(d.date)}</p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{d.mood}/5</p>
                  <p className="font-medium">{label("mood", d.mood)}</p>
                  <p className="text-muted-foreground">{t("anxiety", { value: d.anxiety ?? "-" })}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{t("sessionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("date")}</TH>
                  <TH>{t("professional")}</TH>
                  <TH>{t("status")}</TH>
                  <TH className="text-right">{t("amount")}</TH>
                </TR>
              </THead>
              <TBody>
                {patient.appointments.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("sessionsEmpty")}
                    </TD>
                  </TR>
                ) : (
                  patient.appointments.map((a) => (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap">{f.dateTime(a.startsAt)}</TD>
                      <TD>{a.professional.fullName}</TD>
                      <TD>
                        <StatusBadge kind="appointment" status={a.status} />
                      </TD>
                      <TD className="text-right">{f.money(a.price)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("financeTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("dueDate")}</TH>
                  <TH className="text-right">{t("amount")}</TH>
                  <TH>{t("status")}</TH>
                  <TH>{t("paymentMethod")}</TH>
                </TR>
              </THead>
              <TBody>
                {patient.charges.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("chargesEmpty")}
                    </TD>
                  </TR>
                ) : (
                  patient.charges.map((c) => (
                    <TR key={c.id}>
                      <TD>{f.date(c.dueDate)}</TD>
                      <TD className="text-right">{f.money(c.amount)}</TD>
                      <TD>
                        <StatusBadge kind="charge" status={chargeDisplayStatus(c.status, c.dueDate)} />
                      </TD>
                      <TD>{label("paymentMethod", c.method)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-strong" aria-hidden /> {t("lgpdTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {patient.consentRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("consentsEmpty")}</p>
            ) : (
              patient.consentRecords.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{label("consentPurpose", r.purpose)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("consentRecord", {
                      basis: label("legalBasis", r.legalBasis),
                      state: r.granted ? t("granted") : t("revoked"),
                      date: f.dateTime(r.grantedAt),
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {t.rich("rights", {
              link: (chunks) => (
                <Link className="text-primary-strong underline-offset-4 hover:underline" href="/app/lgpd">
                  {chunks}
                </Link>
              ),
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SmallCard = ({ label, value, tone }: { label: string; value: string; tone?: "warn" }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "warn" ? "text-warning-strong" : ""}`}>{value}</p>
    </CardContent>
  </Card>
);

