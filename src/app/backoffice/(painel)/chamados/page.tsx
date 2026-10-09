import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/backoffice/auth";
import { OPEN_STATUSES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/support";
import {
  ticketCategoryLabel,
  ticketPriorityLabel,
  ticketPriorityVariant,
  ticketStatusLabel,
  ticketStatusVariant,
} from "@/lib/backoffice/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/utils";

type Search = { status?: string; categoria?: string; prioridade?: string; q?: string; meus?: string };

const PAGE_SIZE = 50;

export default async function TicketsPage({ searchParams }: { searchParams: Search }) {
  const me = await requireBackoffice({ perm: "chamados.ver" });
  // Padrão: só os que ainda pedem ação. "todos" mostra também resolvidos e fechados.
  const status = searchParams.status ?? "abertos";
  const q = searchParams.q?.trim();
  const number = q && /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;

  const where: Prisma.SupportTicketWhereInput = {
    ...(status === "abertos" ? { status: { in: OPEN_STATUSES } } : status in TICKET_STATUSES ? { status } : {}),
    ...(searchParams.categoria && searchParams.categoria in TICKET_CATEGORIES ? { category: searchParams.categoria } : {}),
    ...(searchParams.prioridade && searchParams.prioridade in TICKET_PRIORITIES ? { priority: searchParams.prioridade } : {}),
    ...(searchParams.meus ? { assigneeId: me.id } : {}),
    ...(number
      ? { number }
      : q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { requesterName: { contains: q, mode: "insensitive" } },
              { requesterEmail: { contains: q, mode: "insensitive" } },
              { workspace: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
  };

  const [tickets, total] = await Promise.all([
    db.supportTicket.findMany({
      where,
      // Mensagem nova primeiro, depois o que mexeu por último.
      orderBy: [{ unreadByStaff: "desc" }, { lastActivityAt: "desc" }],
      take: PAGE_SIZE,
      include: {
        workspace: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
    db.supportTicket.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chamados</h1>
        <p className="text-sm text-muted-foreground">
          Mensagens abertas pelos clientes no suporte do app (bugs, dúvidas, sugestões).
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(3,minmax(0,160px))_auto] lg:items-end" role="search">
            <div className="space-y-1.5">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="Nº, assunto, nome, e-mail ou consultório" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Situação</Label>
              <Select id="status" name="status" defaultValue={status}>
                <option value="abertos">Em aberto</option>
                <option value="todos">Todos</option>
                {Object.entries(TICKET_STATUSES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoria">Tipo</Label>
              <Select id="categoria" name="categoria" defaultValue={searchParams.categoria ?? ""}>
                <option value="">Todos</option>
                {Object.entries(TICKET_CATEGORIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select id="prioridade" name="prioridade" defaultValue={searchParams.prioridade ?? ""}>
                <option value="">Todas</option>
                {Object.entries(TICKET_PRIORITIES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="meus" value="1" defaultChecked={!!searchParams.meus} className="h-4 w-4 accent-primary" />
                Só meus
              </label>
              <Button type="submit">Filtrar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="h-8 w-8" aria-hidden />}
          title="Nenhum chamado encontrado"
          description="Ajuste os filtros. Quando o toggle de suporte estiver no app, os chamados dos clientes chegam aqui."
        />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <THead>
                <TR>
                  <TH>Chamado</TH>
                  <TH>Cliente</TH>
                  <TH>Tipo</TH>
                  <TH>Prioridade</TH>
                  <TH>Situação</TH>
                  <TH>Responsável</TH>
                  <TH className="text-right">Última atividade</TH>
                </TR>
              </THead>
              <TBody>
                {tickets.map((t) => (
                  <TR key={t.id} className={t.unreadByStaff ? "bg-brand/[.04]" : undefined}>
                    <TD className="max-w-[280px]">
                      <Link prefetch={false} href={`/backoffice/chamados/${t.id}`} className="block hover:underline">
                        <span className="flex items-center gap-2">
                          {t.unreadByStaff ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Mensagem nova" /> : null}
                          <span className={t.unreadByStaff ? "truncate font-semibold" : "truncate font-medium"}>
                            #{t.number} · {t.subject}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t._count.messages} mensage{t._count.messages === 1 ? "m" : "ns"}
                        </span>
                      </Link>
                    </TD>
                    <TD>
                      <span className="block">{t.requesterName}</span>
                      <span className="block text-xs text-muted-foreground">{t.workspace?.name ?? "Conta removida"}</span>
                    </TD>
                    <TD>{ticketCategoryLabel(t.category)}</TD>
                    <TD>
                      <Badge variant={ticketPriorityVariant(t.priority)}>{ticketPriorityLabel(t.priority)}</Badge>
                    </TD>
                    <TD>
                      <Badge variant={ticketStatusVariant(t.status)}>{ticketStatusLabel(t.status)}</Badge>
                    </TD>
                    <TD className="text-sm">{t.assignee?.name ?? <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="text-right text-sm">{formatDateTimeBR(t.lastActivityAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {total > PAGE_SIZE ? (
              <p className="px-3 pt-3 text-xs text-muted-foreground">
                Mostrando {PAGE_SIZE} de {total}. Refine a busca para ver os demais.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
