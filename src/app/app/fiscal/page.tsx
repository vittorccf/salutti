import { requireContext } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getFormat, getTranslations } from "@/i18n/server";
import { AlertCircle, Building2, FileSignature, Landmark, Receipt as ReceiptIcon, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const ctx = await requirePermission("fiscal.ver");
  const t = await getTranslations("finance.tax");
  const f = await getFormat();
  const [receipts, invoices] = await Promise.all([
    db.receipt.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    }),
    db.invoice.findMany({
      where: { workspaceId: ctx.workspace.id },
      include: { patient: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    }),
  ]);

  const rsConfirmed = receipts.filter((r) => r.receitaSaudeStatus === "confirmed").length;
  const rsError = receipts.filter((r) => r.receitaSaudeStatus === "error").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <FileSignature className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning-strong mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold text-warning-strong">{t("rsTitle")}</p>
            <p className="text-muted-foreground">{t("rsBody")}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge variant="success">{t("confirmed", { count: rsConfirmed })}</Badge>
              <Badge variant={rsError > 0 ? "destructive" : "muted"}>{t("withError", { count: rsError })}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptIcon className="h-5 w-5 text-brand" aria-hidden /> {t("receipts")}
              </CardTitle>
              <CardDescription>{t("receiptsDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("number")}</TH>
                  <TH>{t("patient")}</TH>
                  <TH className="text-right">{t("amount")}</TH>
                  <TH>{t("receitaSaude")}</TH>
                </TR>
              </THead>
              <TBody>
                {receipts.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("noReceipts")}
                    </TD>
                  </TR>
                ) : (
                  receipts.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono">{r.receiptNumber}</TD>
                      <TD>{r.patient.fullName}</TD>
                      <TD className="text-right">{f.money(r.amount)}</TD>
                      <TD>
                        <StatusBadge kind="receitaSaude" status={r.receitaSaudeStatus} />
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
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand" aria-hidden /> {t("nfse")}
            </CardTitle>
            <CardDescription>{t("nfseDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>{t("number")}</TH>
                  <TH>{t("patient")}</TH>
                  <TH className="text-right">{t("amount")}</TH>
                  <TH>{t("status")}</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center text-muted-foreground">
                      {t("noInvoices")}
                    </TD>
                  </TR>
                ) : (
                  invoices.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono">{i.invoiceNumber}</TD>
                      <TD>{i.patient.fullName}</TD>
                      <TD className="text-right">{f.money(i.amount)}</TD>
                      <TD>
                        <StatusBadge kind="invoice" status={i.issStatus} />
                      </TD>
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
            <ShieldCheck className="h-5 w-5 text-brand" aria-hidden /> {t("certificate")}
          </CardTitle>
          <CardDescription>{t("certificateDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("certificateStatus")} <StatusBadge kind="integration" status="sandbox" /> · {t("certificateBody")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
