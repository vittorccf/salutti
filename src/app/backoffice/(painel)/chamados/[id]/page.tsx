import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ArrowLeft, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { recordBackofficeAudit, requireBackoffice } from "@/lib/backoffice/auth";
import { prioritySchema, statusSchema, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/support";
import {
  planLabel,
  ticketCategoryLabel,
  ticketPriorityLabel,
  ticketPriorityVariant,
  ticketStatusLabel,
  ticketStatusVariant,
} from "@/lib/backoffice/labels";
import { ActionForm, type FormResult } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTimeBR } from "@/lib/utils";

const replySchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().trim().min(1, "Escreva a resposta.").max(5000),
  internal: z.boolean(),
  status: statusSchema,
  loadedAt: z.coerce.number(),
});

async function replyAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice();
  const parsed = replySchema.safeParse({
    ticketId: formData.get("ticketId"),
    message: formData.get("message"),
    internal: formData.get("internal") === "on",
    status: formData.get("status"),
    loadedAt: formData.get("loadedAt"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Confira os campos." };
  const { ticketId, message, internal, status, loadedAt } = parsed.data;
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { erro: "Chamado não encontrado." };
  // O cliente escreveu enquanto a resposta era digitada: a mensagem dele continua marcada como nova.
  const clientWroteMeanwhile = await db.supportMessage.count({
    where: { ticketId, authorType: "cliente", createdAt: { gt: new Date(loadedAt) } },
  });

  await db.$transaction([
    db.supportMessage.create({ data: { ticketId, authorType: "equipe", backofficeUserId: me.id, body: message, internal } }),
    db.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        lastActivityAt: new Date(),
        unreadByStaff: clientWroteMeanwhile > 0,
        // Nota interna não avisa o cliente.
        ...(internal ? {} : { unreadByClient: true }),
        resolvedAt: status === "resolvido" || status === "fechado" ? (ticket.resolvedAt ?? new Date()) : null,
        // Quem responde primeiro assume o chamado.
        ...(ticket.assigneeId ? {} : { assigneeId: me.id }),
      },
    }),
  ]);
  await recordBackofficeAudit({
    userId: me.id,
    action: internal ? "ticket.note" : "ticket.reply",
    entity: "SupportTicket",
    entityId: ticketId,
    metadata: { status },
  });
  revalidatePath(`/backoffice/chamados/${ticketId}`);
  if (clientWroteMeanwhile > 0) return { ok: "Enviado. O cliente escreveu enquanto você respondia: veja a mensagem acima." };
  return { ok: internal ? "Nota interna salva." : "Resposta enviada ao cliente." };
}

const manageSchema = z.object({
  ticketId: z.string().min(1),
  status: statusSchema,
  priority: prioritySchema,
  assigneeId: z.string(),
});

async function manageAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  "use server";
  const me = await requireBackoffice();
  const parsed = manageSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { erro: "Confira os campos." };
  const { ticketId, status, priority, assigneeId } = parsed.data;
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { erro: "Chamado não encontrado." };
  if (assigneeId && !(await db.backofficeUser.findFirst({ where: { id: assigneeId, active: true } }))) {
    return { erro: "Responsável inválido." };
  }

  const changes: string[] = [];
  if (ticket.status !== status) changes.push(`situação: ${ticketStatusLabel(ticket.status)} → ${ticketStatusLabel(status)}`);
  if (ticket.priority !== priority) changes.push(`prioridade: ${ticketPriorityLabel(ticket.priority)} → ${ticketPriorityLabel(priority)}`);
  if ((ticket.assigneeId ?? "") !== assigneeId) changes.push("responsável alterado");
  if (changes.length === 0) return { ok: "Nada mudou." };

  await db.$transaction([
    db.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        priority,
        assigneeId: assigneeId || null,
        resolvedAt: status === "resolvido" || status === "fechado" ? (ticket.resolvedAt ?? new Date()) : null,
      },
    }),
    // Registro no histórico, visível só para a equipe.
    db.supportMessage.create({
      data: { ticketId, authorType: "sistema", backofficeUserId: me.id, internal: true, body: `${me.name} alterou ${changes.join("; ")}.` },
    }),
  ]);
  await recordBackofficeAudit({ userId: me.id, action: "ticket.update", entity: "SupportTicket", entityId: ticketId, metadata: { status, priority, assigneeId } });
  revalidatePath(`/backoffice/chamados/${ticketId}`);
  return { ok: "Chamado atualizado." };
}

export default async function TicketPage({ params }: { params: { id: string } }) {
  const me = await requireBackoffice();
  const ticket = await db.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { backofficeUser: { select: { name: true } } } },
      workspace: { select: { id: true, name: true, planTier: true, area: true } },
      user: { select: { id: true, email: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  if (!ticket) notFound();
  // Abrir o chamado é o "lido" da equipe. Leitura também fica na auditoria (quem viu o quê).
  if (ticket.unreadByStaff) await db.supportTicket.update({ where: { id: ticket.id }, data: { unreadByStaff: false } });
  await recordBackofficeAudit({ userId: me.id, action: "ticket.view", entity: "SupportTicket", entityId: ticket.id });
  const loadedAt = Date.now();

  const [staff, plans, otherTickets] = await Promise.all([
    db.backofficeUser.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.platformPlan.findMany({ select: { code: true, name: true } }),
    ticket.userId
      ? db.supportTicket.count({ where: { userId: ticket.userId, id: { not: ticket.id } } })
      : Promise.resolve(0),
  ]);

  const context = [
    ["Página", ticket.pageUrl],
    ["Navegador", ticket.userAgent],
    ["Tela", ticket.viewport],
    ["Versão do app", ticket.appVersion],
    ["Idioma", ticket.locale],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/backoffice/chamados" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Chamados
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          #{ticket.number} · {ticket.subject}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant={ticketStatusVariant(ticket.status)}>{ticketStatusLabel(ticket.status)}</Badge>
          <Badge variant={ticketPriorityVariant(ticket.priority)}>{ticketPriorityLabel(ticket.priority)}</Badge>
          <Badge variant="outline">{ticketCategoryLabel(ticket.category)}</Badge>
          <span>Aberto em {formatDateTimeBR(ticket.createdAt)}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <ol className="space-y-3" aria-label="Conversa">
            {ticket.messages.map((m) => {
              if (m.authorType === "sistema") {
                return (
                  <li key={m.id} className="text-center text-xs text-muted-foreground">
                    {m.body} · {formatDateTimeBR(m.createdAt)}
                  </li>
                );
              }
              const fromClient = m.authorType === "cliente";
              return (
                <li key={m.id} className={cn("flex", fromClient ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg border p-3 text-sm",
                      fromClient && "bg-card",
                      !fromClient && !m.internal && "border-brand/30 bg-brand/[.06]",
                      m.internal && "border-dashed border-warning/50 bg-warning/[.08]",
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {m.internal ? <Lock className="h-3 w-3" aria-hidden /> : null}
                      {fromClient ? ticket.requesterName : (m.backofficeUser?.name ?? "Equipe Salutti")}
                      {m.internal ? " · nota interna" : null} · {formatDateTimeBR(m.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Responder</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={replyAction} resetOnSuccess className="space-y-3">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input type="hidden" name="loadedAt" value={loadedAt} />
                <div className="space-y-1.5">
                  <Label htmlFor="message" className="sr-only">
                    Mensagem
                  </Label>
                  <Textarea id="message" name="message" rows={5} required maxLength={5000} placeholder="Escreva a resposta ao cliente…" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="internal" className="h-4 w-4 accent-primary" />
                      Nota interna (o cliente não vê)
                    </label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="reply-status" className="text-sm font-normal">
                        Depois, marcar como
                      </Label>
                      <Select id="reply-status" name="status" defaultValue="aguardando_cliente" className="h-9 w-auto">
                        {Object.entries(TICKET_STATUSES).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <Button type="submit">Enviar</Button>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gerenciar</CardTitle>
            </CardHeader>
            <CardContent>
              {/* key: depois de uma resposta que muda a situação, o formulário remonta com os valores atuais. */}
              <ActionForm
                key={`${ticket.status}-${ticket.priority}-${ticket.assigneeId ?? ""}`}
                action={manageAction}
                className="space-y-3"
              >
                <input type="hidden" name="ticketId" value={ticket.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="status">Situação</Label>
                  <Select id="status" name="status" defaultValue={ticket.status}>
                    {Object.entries(TICKET_STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select id="priority" name="priority" defaultValue={ticket.priority}>
                    {Object.entries(TICKET_PRIORITIES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assigneeId">Responsável</Label>
                  <Select id="assigneeId" name="assigneeId" defaultValue={ticket.assigneeId ?? ""}>
                    <option value="">Ninguém</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" variant="outline" className="w-full">
                  Salvar
                </Button>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{ticket.requesterName}</p>
              <p className="break-all text-muted-foreground">{ticket.requesterEmail}</p>
              {ticket.workspace ? (
                <p>
                  <Link href={`/backoffice/clientes/${ticket.workspace.id}`} className="font-medium hover:underline">
                    {ticket.workspace.name}
                  </Link>
                  <span className="text-muted-foreground"> · {planLabel(ticket.workspace.planTier, plans)}</span>
                </p>
              ) : (
                <p className="text-muted-foreground">Consultório removido.</p>
              )}
              {ticket.user && otherTickets > 0 ? (
                <p>
                  <Link href={`/backoffice/chamados?status=todos&q=${encodeURIComponent(ticket.requesterEmail)}`} className="text-brand hover:underline">
                    Outros {otherTickets} chamado{otherTickets > 1 ? "s" : ""} desta pessoa
                  </Link>
                </p>
              ) : null}
              {!ticket.user ? <p className="text-muted-foreground">Conta do usuário removida.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contexto técnico</CardTitle>
            </CardHeader>
            <CardContent>
              {context.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada capturado.</p>
              ) : (
                <dl className="space-y-2 text-sm">
                  {context.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
