import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTimeBR } from "@/lib/utils";
import { MessageSquareText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ComunicacaoPage() {
  const ctx = await requireContext();
  const logs = await db.notificationLog.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquareText className="h-6 w-6 text-primary-strong" aria-hidden /> Comunicação
        </h1>
        <p className="text-sm text-muted-foreground">
          Mensagens enviadas pelo WhatsApp com modelos aprovados: lembretes, cobranças e recibos.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens recentes</CardTitle>
          <CardDescription>Lembretes de sessão, cobranças, recibos e boas-vindas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Quando</TH>
                <TH>Canal</TH>
                <TH>Destinatário</TH>
                <TH>Modelo</TH>
                <TH>Mensagem</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {logs.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-muted-foreground">
                    Nenhuma mensagem enviada ainda. Os lembretes de sessão aparecem aqui.
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
                      <TD className="whitespace-nowrap">{formatDateTimeBR(l.createdAt)}</TD>
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

const templateLabel = (template: string) =>
  ({
    reminder_24h: "Lembrete 24h",
    charge_due: "Cobrança a vencer",
    charge_overdue: "Cobrança atrasada",
  })[template] ?? template.replaceAll("_", " ");
