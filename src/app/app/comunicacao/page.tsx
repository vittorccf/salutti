import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { getFormat, getTranslations } from "@/i18n/server";
import { MessageSquareText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ComunicacaoPage() {
  const ctx = await requireContext();
  const logs = await db.notificationLog.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const t = await getTranslations("settings.communication");
  const f = await getFormat();
  const templateLabel = (template: string) =>
    t.has(`templates.${template}`) ? t(`templates.${template}`) : template.replaceAll("_", " ");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title flex items-center gap-2">
          <MessageSquareText className="h-6 w-6 text-brand" aria-hidden /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("intro")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("recentTitle")}</CardTitle>
          <CardDescription>{t("recentDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>{t("when")}</TH>
                <TH>{t("channel")}</TH>
                <TH>{t("recipient")}</TH>
                <TH>{t("template")}</TH>
                <TH>{t("message")}</TH>
                <TH>{t("status")}</TH>
              </TR>
            </THead>
            <TBody>
              {logs.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-muted-foreground">
                    {t("empty")}
                  </TD>
                </TR>
              ) : (
                logs.map((l) => {
                  let payload: { body?: string } = {};
                  try {
                    payload = JSON.parse(l.payload) as { body?: string };
                  } catch {}
                  return (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap">{f.dateTime(l.createdAt)}</TD>
                      <TD>
                        <Badge variant="outline">{l.channel === "whatsapp" ? "WhatsApp" : l.channel}</Badge>
                      </TD>
                      <TD className="font-mono text-xs">{l.recipient}</TD>
                      <TD>{templateLabel(l.template)}</TD>
                      <TD className="max-w-[360px] truncate text-xs text-muted-foreground">{payload.body}</TD>
                      <TD>
                        <StatusBadge kind="message" status={l.status} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
