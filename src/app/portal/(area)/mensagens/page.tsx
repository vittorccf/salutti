import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { getPortalSession } from "@/lib/portal-auth";
import { MESSAGE_MAX } from "@/lib/portal";
import { getFormat, getTranslations } from "@/i18n/server";
import { ActionForm } from "@/components/forms/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { MessageThread } from "@/components/message-thread";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendMessageAction } from "../../_actions";

export default async function PortalMessagesPage() {
  const access = (await getPortalSession())!;
  const { patient } = access;
  const [t, f] = await Promise.all([getTranslations("portal.messages"), getFormat()]);
  // Abrir a conversa marca como lidas as mensagens do consultório.
  await db.portalMessage.updateMany({ where: { patientId: patient.id, fromPatient: false, readAt: null }, data: { readAt: new Date() } });
  const messages = await db.portalMessage.findMany({ where: { patientId: patient.id, workspaceId: patient.workspaceId }, orderBy: { createdAt: "asc" }, take: 200 });
  const authors = await db.user.findMany({
    where: { id: { in: [...new Set(messages.map((m) => m.authorUserId).filter((x): x is string => !!x))] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string | null) => authors.find((a) => a.id === id)?.name ?? patient.workspace.name;

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{patient.workspace.portalMessageNotice || t("defaultNotice")}</p>
      </div>
      <p role="note" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {t("emergency")}
      </p>
      <MessageThread
        emptyText={t("empty")}
        readLabel={t("read")}
        messages={messages.map((m) => ({
          id: m.id,
          body: m.body,
          mine: m.fromPatient,
          author: m.fromPatient ? t("you") : nameOf(m.authorUserId),
          at: f.dateTime(m.createdAt),
          read: !!m.readAt,
        }))}
      />
      {access.messagesEnabled ? (
        <ActionForm action={sendMessageAction} resetOnSuccess className="sticky bottom-20 space-y-2 rounded-xl border bg-background/95 p-3 backdrop-blur">
          <Label htmlFor="body" className="sr-only">
            {t("write")}
          </Label>
          <Textarea id="body" name="body" rows={3} required maxLength={MESSAGE_MAX} placeholder={t("placeholder")} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t("privacy")}</span>
            <Button type="submit">{t("send")}</Button>
          </div>
        </ActionForm>
      ) : (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">{t("disabled")}</p>
      )}
    </div>
  );
}
