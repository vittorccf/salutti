import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/backoffice/auth";
import { memberRoleLabel } from "@/lib/backoffice/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateBR } from "@/lib/utils";

const PAGE_SIZE = 100;

export default async function UsersPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireBackoffice();
  const q = searchParams.q?.trim();
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        totpEnabledAt: true,
        locale: true,
        memberships: { select: { role: true, workspace: { select: { id: true, name: true } } } },
        _count: { select: { supportTickets: true } },
      },
    }),
    db.user.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">Pessoas com login no app ({total}).</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="Nome ou e-mail" />
            </div>
            <Button type="submit">Buscar</Button>
          </form>
        </CardContent>
      </Card>

      {users.length === 0 ? (
        <EmptyState title="Nenhum usuário encontrado" />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Consultórios</TH>
                  <TH>2FA</TH>
                  <TH className="text-right">Chamados</TH>
                  <TH className="text-right">Cadastro</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <span className="block font-medium">{u.name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </TD>
                    <TD>
                      <ul className="space-y-0.5 text-sm">
                        {u.memberships.map((m) => (
                          <li key={m.workspace.id}>
                            <Link href={`/backoffice/clientes/${m.workspace.id}`} className="hover:underline">
                              {m.workspace.name}
                            </Link>
                            <span className="text-xs text-muted-foreground"> · {memberRoleLabel(m.role)}</span>
                          </li>
                        ))}
                        {u.memberships.length === 0 ? <li className="text-muted-foreground">Sem consultório</li> : null}
                      </ul>
                    </TD>
                    <TD>{u.totpEnabledAt ? <Badge variant="success">Ativo</Badge> : <Badge variant="muted">Não</Badge>}</TD>
                    <TD className="text-right">
                      {u._count.supportTickets > 0 ? (
                        <Link href={`/backoffice/chamados?status=todos&q=${encodeURIComponent(u.email)}`} className="hover:underline">
                          {u._count.supportTickets}
                        </Link>
                      ) : (
                        0
                      )}
                    </TD>
                    <TD className="text-right text-sm">{formatDateBR(u.createdAt)}</TD>
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
