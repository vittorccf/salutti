import { db } from "@/lib/db";
import { requireBackoffice } from "@/lib/backoffice/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/utils";

const ACTIONS: Record<string, string> = {
  login: "Entrou",
  "login.failed": "Senha incorreta",
  "login.locked": "Acesso bloqueado (tentativas)",
  logout: "Saiu",
  "password.change": "Trocou a própria senha",
  "ticket.view": "Abriu chamado",
  "workspace.view": "Abriu ficha de cliente",
  "ticket.reply": "Respondeu chamado",
  "ticket.note": "Nota interna em chamado",
  "ticket.update": "Alterou chamado",
  "workspace.plan": "Mudou plano de cliente",
  "plan.update": "Editou plano",
  "staff.create": "Adicionou pessoa à equipe",
  "staff.toggle": "Ativou/desativou pessoa da equipe",
  "staff.reset": "Redefiniu senha de pessoa da equipe",
  "staff.role": "Mudou papel na equipe",
  "support.grant.create": "Gerou acesso à conta de cliente",
  "support.grant.revoke": "Revogou acesso à conta de cliente",
  "support.grant.denied": "Acesso à conta de cliente negado (senha)",
};

export default async function AuditPage() {
  await requireBackoffice({ role: "admin" });
  const events = await db.backofficeAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { backofficeUser: { select: { name: true, username: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Últimas 200 ações feitas no backoffice.</p>
      </div>
      {events.length === 0 ? (
        <EmptyState title="Nada registrado ainda" />
      ) : (
        <Card>
          <CardContent className="pt-2">
            <Table>
              <THead>
                <TR>
                  <TH>Quando</TH>
                  <TH>Quem</TH>
                  <TH>Ação</TH>
                  <TH>Registro</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {events.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-sm">{formatDateTimeBR(e.createdAt)}</TD>
                    <TD>{e.backofficeUser ? `${e.backofficeUser.name} (${e.backofficeUser.username})` : "—"}</TD>
                    <TD>{ACTIONS[e.action] ?? e.action}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {e.entity}
                      {e.entityId ? ` · ${e.entityId}` : ""}
                    </TD>
                    <TD className="text-xs text-muted-foreground">{e.ipAddress ?? "—"}</TD>
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
