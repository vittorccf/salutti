import Link from "next/link";
import { requireClinicalContext } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ClipboardList, FilePlus2 } from "lucide-react";
import { getFormat, getTranslations } from "@/i18n/server";
import { labeler } from "@/i18n/labels";

export const dynamic = "force-dynamic";

export default async function ProntuarioListPage() {
  const ctx = await requireClinicalContext();
  const notes = await db.clinicalNote.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { patient: true, professional: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const [t, tLabels, f] = await Promise.all([getTranslations("patients.records"), getTranslations("common.labels"), getFormat()]);
  const label = labeler(tLabels);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </header>

      {notes.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Button asChild>
              <Link href="/app/pacientes">
                <FilePlus2 className="h-4 w-4" /> {t("selectPatient")}
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("patient")}</TH>
                  <TH>{t("professional")}</TH>
                  <TH>{t("type")}</TH>
                  <TH>{t("updated")}</TH>
                  <TH>{t("saluttin")}</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {notes.map((n) => (
                  <TR key={n.id}>
                    <TD className="font-medium">{n.patient.fullName}</TD>
                    <TD>{n.professional.fullName}</TD>
                    <TD>{label("noteType", n.noteType)}</TD>
                    <TD className="whitespace-nowrap">{f.dateTime(n.updatedAt)}</TD>
                    <TD>
                      {n.aiSummary ? (
                        <Badge variant="success">{t("summarized")}</Badge>
                      ) : (
                        <Badge variant="muted">{t("pending")}</Badge>
                      )}
                    </TD>
                    <TD>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/prontuario/${n.patient.id}`}>{t("open")}</Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
