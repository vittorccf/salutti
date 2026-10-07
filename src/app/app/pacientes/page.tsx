import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Plus, UserPlus, Users } from "lucide-react";
import { getFormat, getTranslations } from "@/i18n/server";
import { PhoneText } from "@/components/ui/phone";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const patients = await db.patient.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { cpf: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { appointments: true, charges: true } },
      consentRecords: { where: { purpose: "tutela_saude", revokedAt: null }, take: 1 },
    },
    take: 100,
  });
  const [t, tc, tActions, f] = await Promise.all([
    getTranslations("patients.list"),
    getTranslations("common.count"),
    getTranslations("common.actions"),
    getFormat(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title flex items-center gap-2">
            <Users className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {q ? t("resultsFor", { count: patients.length, query: q }) : tc("patients", { count: patients.length })}
          </p>
        </div>
        <Button asChild>
          <Link href="/app/pacientes/novo">
            <UserPlus className="h-4 w-4" aria-hidden /> {t("new")}
          </Link>
        </Button>
      </header>

      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <Button type="submit" variant="outline">
          {tActions("search")}
        </Button>
      </form>

      {patients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" aria-hidden />}
          title={q ? t("emptySearchTitle") : t("emptyTitle")}
          description={
            q ? t("emptySearchDescription") : t("emptyDescription")
          }
          action={
            // O cabeçalho já tem a ação principal "Novo paciente": aqui fica secundária.
            <Button variant="outline" asChild>
              <Link href="/app/pacientes/novo">
                <Plus className="h-4 w-4" aria-hidden /> {t("create")}
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
                  <TH>{t("name")}</TH>
                  <TH>{t("contact")}</TH>
                  <TH>{t("birthDate")}</TH>
                  <TH className="text-right">{t("sessions")}</TH>
                  <TH>{t("consent")}</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {patients.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      <Link className="hover:underline" href={`/app/pacientes/${p.id}`}>
                        {p.fullName}
                      </Link>
                    </TD>
                    <TD className="text-muted-foreground text-sm">
                      <PhoneText value={p.phone} />
                      <br />
                      {p.email ?? ""}
                    </TD>
                    <TD>{p.birthDate ? f.date(p.birthDate) : "-"}</TD>
                    <TD className="text-right">{p._count.appointments}</TD>
                    <TD>
                      {p.consentRecords.length > 0 ? (
                        <Badge variant="success">{t("consented")}</Badge>
                      ) : (
                        <Badge variant="warning">{t("pending")}</Badge>
                      )}
                    </TD>
                    <TD>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/pacientes/${p.id}`}>{t("open")}</Link>
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
