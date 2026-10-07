import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/backoffice/auth";
import { accountTypeLabel, AREA_LABELS, areaLabel, planLabel } from "@/lib/backoffice/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateBR } from "@/lib/utils";

type Search = { q?: string; plano?: string; area?: string };
const PAGE_SIZE = 100;

export default async function ClientsPage({ searchParams }: { searchParams: Search }) {
  await requireBackoffice();
  const q = searchParams.q?.trim();
  const where: Prisma.WorkspaceWhereInput = {
    ...(searchParams.plano ? { planTier: searchParams.plano } : {}),
    ...(searchParams.area && searchParams.area in AREA_LABELS ? { area: searchParams.area } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { cnpj: { contains: q } },
            { memberships: { some: { user: { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } } } },
          ],
        }
      : {}),
  };

  const [workspaces, total, plans] = await Promise.all([
    db.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        area: true,
        accountType: true,
        planTier: true,
        trialEndsAt: true,
        createdAt: true,
        memberships: { where: { role: "owner" }, take: 1, select: { user: { select: { name: true, email: true } } } },
        _count: { select: { memberships: true, supportTickets: true } },
      },
    }),
    db.workspace.count({ where }),
    db.platformPlan.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">Consultórios e clínicas cadastrados ({total}).</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="Nome, CNPJ, e-mail ou nome do usuário" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plano">Plano</Label>
              <Select id="plano" name="plano" defaultValue={searchParams.plano ?? ""}>
                <option value="">Todos</option>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Área</Label>
              <Select id="area" name="area" defaultValue={searchParams.area ?? ""}>
                <option value="">Todas</option>
                {Object.entries(AREA_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      {workspaces.length === 0 ? (
        <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca ou os filtros." />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <THead>
                <TR>
                  <TH>Consultório</TH>
                  <TH>Responsável</TH>
                  <TH>Área / tipo</TH>
                  <TH>Plano</TH>
                  <TH className="text-right">Usuários</TH>
                  <TH className="text-right">Chamados</TH>
                  <TH className="text-right">Desde</TH>
                </TR>
              </THead>
              <TBody>
                {workspaces.map((w) => {
                  const owner = w.memberships[0]?.user;
                  const trialOver = w.planTier === "trial" && w.trialEndsAt && w.trialEndsAt < now;
                  return (
                    <TR key={w.id}>
                      <TD>
                        <Link href={`/backoffice/clientes/${w.id}`} className="font-medium hover:underline">
                          {w.name}
                        </Link>
                      </TD>
                      <TD>
                        <span className="block">{owner?.name ?? "—"}</span>
                        <span className="block text-xs text-muted-foreground">{owner?.email}</span>
                      </TD>
                      <TD className="text-sm">
                        {areaLabel(w.area)} · {accountTypeLabel(w.accountType)}
                      </TD>
                      <TD>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {planLabel(w.planTier, plans)}
                          {w.planTier === "trial" && w.trialEndsAt ? (
                            <Badge variant={trialOver ? "destructive" : "warning"}>
                              {trialOver ? "expirado" : `até ${formatDateBR(w.trialEndsAt)}`}
                            </Badge>
                          ) : null}
                        </span>
                      </TD>
                      <TD className="text-right">{w._count.memberships}</TD>
                      <TD className="text-right">{w._count.supportTickets}</TD>
                      <TD className="text-right text-sm">{formatDateBR(w.createdAt)}</TD>
                    </TR>
                  );
                })}
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
