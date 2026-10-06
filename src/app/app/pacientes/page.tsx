import Link from "next/link";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Plus, UserPlus, Users } from "lucide-react";
import { formatDateBR, plural } from "@/lib/utils";
import { PhoneText } from "@/components/ui/phone";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireContext();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const patients = await db.patient.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { cpf: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { appointments: true, charges: true } },
      consentRecords: { where: { purpose: "tutela_saude", revokedAt: null }, take: 1 },
    },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary-strong" aria-hidden /> Pacientes
          </h1>
          <p className="text-muted-foreground text-sm">
            {q
              ? `${plural(patients.length, "resultado", "resultados")} para “${q}”`
              : plural(patients.length, "paciente", "pacientes")}
          </p>
        </div>
        <Button asChild>
          <Link href="/app/pacientes/novo">
            <UserPlus className="h-4 w-4" /> Novo paciente
          </Link>
        </Button>
      </header>

      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Nome, e-mail ou CPF" aria-label="Buscar pacientes" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {patients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={q ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
          description={
            q
              ? "Confira a grafia ou busque pelo CPF ou e-mail."
              : "Cadastre o primeiro paciente. CPF e registro profissional são opcionais."
          }
          action={
            <Button asChild>
              <Link href="/app/pacientes/novo">
                <Plus className="h-4 w-4" /> Cadastrar paciente
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>Contato</TH>
                  <TH>Nascimento</TH>
                  <TH className="text-right">Sessões</TH>
                  <TH>Consentimento</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {patients.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      <Link className="hover:underline" href={`/app/pacientes/${p.id}`}>
                        {p.fullName}
                      </Link>
                    </TD>
                    <TD className="text-muted-foreground text-sm">
                      <PhoneText value={p.phone} />
                      <br />
                      {p.email ?? ""}
                    </TD>
                    <TD>{p.birthDate ? formatDateBR(p.birthDate) : "-"}</TD>
                    <TD className="text-right">{p._count.appointments}</TD>
                    <TD>
                      {p.consentRecords.length > 0 ? (
                        <Badge variant="success">Consentido</Badge>
                      ) : (
                        <Badge variant="warning">Pendente</Badge>
                      )}
                    </TD>
                    <TD>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/app/pacientes/${p.id}`}>Abrir</Link>
                      </Button>
                    </TD>
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
