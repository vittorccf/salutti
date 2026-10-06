import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { media } from "@/lib/providers/media";
import { recordAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ShieldCheck, FileDown, Trash2, EyeOff } from "lucide-react";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";
import { assertInWorkspace, ensureAffected } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Os 9 direitos do art. 18 (texto em settings.lgpd.rights.r1…r9).
const rights = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"] as const;

async function exportDataAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  await assertInWorkspace(ctx.workspace.id, { patientId });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.export",
    entity: "Patient",
    entityId: patientId,
  });
  redirect(`/api/lgpd/export?patientId=${patientId}`);
}

async function anonymizeAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  const before = await db.patient.findFirst({ where: { id: patientId, workspaceId: ctx.workspace.id }, select: { photoId: true } });
  // Tudo o que identifica a pessoa sai: contato, documentos, endereço completo, nascimento e foto.
  const anonymized = await db.patient.updateMany({
    where: { id: patientId, workspaceId: ctx.workspace.id },
    data: {
      fullName: "ANONIMIZADO",
      email: null,
      phone: null,
      cpf: null,
      address: null,
      cep: null,
      street: null,
      addressNumber: null,
      complement: null,
      district: null,
      city: null,
      state: null,
      birthDate: null,
      responsibleName: null,
      emergencyContact: null,
      photoId: null,
      notes: null,
      anonymized: true,
      active: false,
    },
  });
  ensureAffected(anonymized);
  await media.remove(before?.photoId);
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.anonymize",
    entity: "Patient",
    entityId: patientId,
  });
  redirect("/app/lgpd");
}

async function softDeleteAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const patientId = formData.get("patientId") as string;
  const before = await db.patient.findFirst({ where: { id: patientId, workspaceId: ctx.workspace.id }, select: { photoId: true } });
  ensureAffected(
    await db.patient.updateMany({
      where: { id: patientId, workspaceId: ctx.workspace.id },
      data: { deletedAt: new Date(), active: false, photoId: null },
    }),
  );
  await media.remove(before?.photoId);
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "lgpd.delete",
    entity: "Patient",
    entityId: patientId,
  });
  redirect("/app/lgpd");
}

export default async function LgpdPage() {
  const ctx = await requireContext();
  const [auditLog, consents, patients] = await Promise.all([
    db.auditLog.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.consentRecord.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { grantedAt: "desc" },
      take: 30,
    }),
    db.patient.findMany({
      where: { workspaceId: ctx.workspace.id, deletedAt: null },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const t = await getTranslations("settings.lgpd");
  const f = await getFormat();
  const label = labeler(await getTranslations("common.labels"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary-strong" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("intro")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("rightsTitle")}</CardTitle>
          <CardDescription>{t("rightsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3 text-sm">
          {rights.map((r, idx) => (
            <div key={r} className="rounded-md border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("right", { n: idx + 1 })}</p>
              <p className="font-medium leading-tight">{t(`rights.${r}`)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("exerciseTitle")}</CardTitle>
          <CardDescription>
            {t("exerciseDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end" action={exportDataAction}>
            <div className="space-y-1">
              <Label htmlFor="patientId">{t("patient")}</Label>
              <Select name="patientId" id="patientId" required>
                <option value="">{t("select")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <Button formAction={exportDataAction} type="submit" variant="outline">
              <FileDown className="h-4 w-4" /> {t("export")}
            </Button>
            <Button formAction={anonymizeAction} type="submit" variant="outline">
              <EyeOff className="h-4 w-4" /> {t("anonymize")}
            </Button>
            <Button formAction={softDeleteAction} type="submit" variant="destructive">
              <Trash2 className="h-4 w-4" /> {t("delete")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{t("consentsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("patient")}</TH>
                  <TH>{t("purpose")}</TH>
                  <TH>{t("legalBasis")}</TH>
                  <TH>{t("status")}</TH>
                </TR>
              </THead>
              <TBody>
                {consents.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("noConsents")}
                    </TD>
                  </TR>
                ) : (
                  consents.map((c) => (
                    <TR key={c.id}>
                      <TD>{c.patient.fullName}</TD>
                      <TD>{label("consentPurpose", c.purpose)}</TD>
                      <TD>{label("legalBasis", c.legalBasis)}</TD>
                      <TD>
                        <Badge variant={c.granted && !c.revokedAt ? "success" : "muted"}>
                          {c.granted && !c.revokedAt ? t("granted") : t("revoked")}
                        </Badge>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("auditTitle")}</CardTitle>
            <CardDescription>{t("auditDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("when")}</TH>
                  <TH>{t("user")}</TH>
                  <TH>{t("action")}</TH>
                  <TH>{t("entity")}</TH>
                </TR>
              </THead>
              <TBody>
                {auditLog.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("noEvents")}
                    </TD>
                  </TR>
                ) : (
                  auditLog.map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap text-xs">{f.dateTime(l.createdAt)}</TD>
                      <TD className="text-xs">{l.user?.name ?? t("system")}</TD>
                      <TD className="font-mono text-xs">{l.action}</TD>
                      <TD className="font-mono text-xs">{l.entity}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
