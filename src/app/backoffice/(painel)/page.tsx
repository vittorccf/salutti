import Link from "next/link";
import { db } from "@/lib/db";
import { SUPPORT_USER_EMAIL } from "@/lib/support-access";
import { requireBackoffice } from "@/lib/backoffice/auth";
import { boCan } from "@/lib/backoffice/permissions";
import { OPEN_STATUSES } from "@/lib/support";
import {
  areaLabel,
  planLabel,
  ticketCategoryLabel,
  ticketStatusLabel,
  ticketStatusVariant,
} from "@/lib/backoffice/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;

export default async function BackofficeHome() {
  // Visão geral: qualquer pessoa ativa da equipe (é para onde volta quem não tem uma permissão).
  const me = await requireBackoffice();
  const canTickets = boCan(me, "chamados.ver");
  const canClients = boCan(me, "clientes.ver");
  const now = new Date();
  const [workspaces, users, newWorkspaces, trialsActive, trialsEnding, byPlan, openTickets, unread, urgent, plans, recentTickets, recentSignups] =
    await Promise.all([
      db.workspace.count(),
      db.user.count({ where: { email: { not: SUPPORT_USER_EMAIL } } }),
      db.workspace.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
      db.workspace.count({ where: { planTier: "trial", trialEndsAt: { gte: now } } }),
      db.workspace.count({ where: { planTier: "trial", trialEndsAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } } }),
      db.workspace.groupBy({ by: ["planTier"], _count: { _all: true } }),
      db.supportTicket.count({ where: { status: { in: OPEN_STATUSES } } }),
      db.supportTicket.count({ where: { unreadByStaff: true } }),
      db.supportTicket.count({ where: { status: { in: OPEN_STATUSES }, priority: "urgente" } }),
      db.platformPlan.findMany({ orderBy: { sortOrder: "asc" } }),
      db.supportTicket.findMany({ orderBy: { lastActivityAt: "desc" }, take: 6 }),
      db.workspace.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, name: true, area: true, planTier: true, createdAt: true },
      }),
    ]);

  const stats = [
    { label: "Clientes (consultórios)", value: workspaces, hint: `${newWorkspaces} nos últimos 30 dias`, href: "/backoffice/clientes" },
    { label: "Usuários", value: users, hint: "Pessoas com login no app", href: "/backoffice/usuarios" },
    { label: "Em teste grátis", value: trialsActive, hint: `${trialsEnding} terminam em 7 dias`, href: "/backoffice/clientes?plano=trial" },
    {
      label: "Chamados abertos",
      value: openTickets,
      hint: `${unread} com mensagem nova${urgent ? ` · ${urgent} urgente${urgent > 1 ? "s" : ""}` : ""}`,
      href: "/backoffice/chamados",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground">Clientes, planos e suporte da plataforma.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader className="pb-2">
                <CardDescription>{s.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{s.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{s.hint}</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {canTickets ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Chamados recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTickets.length === 0 ? (
              <EmptyState title="Nenhum chamado ainda" description="Quando o toggle de suporte for ligado, os chamados aparecem aqui." />
            ) : (
              <ul className="divide-y">
                {recentTickets.map((t) => (
                  <li key={t.id}>
                    <Link prefetch={false} href={`/backoffice/chamados/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {t.unreadByStaff ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Mensagem nova" /> : <span className="h-2 w-2 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          #{t.number} · {t.subject}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.requesterName} · {ticketCategoryLabel(t.category)} · {formatDateTimeBR(t.lastActivityAt)}
                        </span>
                      </span>
                      <Badge variant={ticketStatusVariant(t.status)}>{ticketStatusLabel(t.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clientes por plano</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {byPlan
                .sort((a, b) => b._count._all - a._count._all)
                .map((p) => (
                  <li key={p.planTier} className="flex items-center justify-between">
                    <Link href={`/backoffice/clientes?plano=${p.planTier}`} className="hover:underline">
                      {planLabel(p.planTier, plans)}
                    </Link>
                    <span className="tabular-nums font-medium">{p._count._all}</span>
                  </li>
                ))}
              {byPlan.length === 0 ? <li className="text-muted-foreground">Nenhum cliente ainda.</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      {canClients ? (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastros recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Consultório</TH>
                <TH>Área</TH>
                <TH>Plano</TH>
                <TH className="text-right">Criado em</TH>
              </TR>
            </THead>
            <TBody>
              {recentSignups.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <Link href={`/backoffice/clientes/${w.id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                  </TD>
                  <TD>{areaLabel(w.area)}</TD>
                  <TD>{planLabel(w.planTier, plans)}</TD>
                  <TD className="text-right">{formatDateBR(w.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
