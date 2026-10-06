import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Handshake } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { formatBRL, plural } from "@/lib/utils";
import { CNES_NAO_INFORMADO } from "@/lib/tiss";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  name: z.string().trim().min(2),
  ansRegistry: z.string().trim().regex(/^\d{6}$/, "Registro ANS tem 6 dígitos"),
  providerCode: z.string().trim().max(14).optional(),
  sessionPrice: z.coerce.number().positive(),
});

async function createPlanAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/app/convenios?erro=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const plan = await db.insurancePlan.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      ansRegistry: parsed.data.ansRegistry,
      providerCode: parsed.data.providerCode || null,
      sessionPrice: parsed.data.sessionPrice,
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "insurance_plan.create", entity: "InsurancePlan", entityId: plan.id });
  redirect("/app/convenios");
}

const providerSchema = z.object({
  cnpj: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 14, "CNPJ tem 14 dígitos"),
  cnes: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{7}$/.test(v), "CNES tem 7 dígitos"),
});

async function saveProviderAction(formData: FormData) {
  "use server";
  const ctx = await requireContext();
  const parsed = providerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/app/convenios?erro=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { cnpj, cnes } = parsed.data;
  await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: {
      cnpj: cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : null,
      cnes: cnes || null,
    },
  });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "workspace.provider_data", entity: "Workspace", entityId: ctx.workspace.id });
  redirect("/app/convenios");
}

export default async function InsurancePlansPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const ctx = await requireContext();
  const { erro } = await searchParams;
  const plans = await db.insurancePlan.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { patients: true, batches: true } },
      appointments: { where: { status: "done", tissGuide: null }, select: { id: true } },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Handshake className="h-6 w-6 text-primary-strong" aria-hidden /> Convênios
        </h1>
        <p className="text-sm text-muted-foreground">
          Operadoras de saúde e faturamento por lote no Padrão TISS 4.03.00 da ANS.
        </p>
      </header>

      {erro ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong">
          {erro}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Operadoras</CardTitle>
            <CardDescription>Cada sessão realizada por convênio vira uma guia no próximo lote.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {plans.length === 0 ? (
              <div className="p-6 pt-0">
                <EmptyState
                  icon={<Handshake className="h-6 w-6" />}
                  title="Nenhum convênio cadastrado"
                  description="Cadastre a operadora ao lado com o registro ANS e o valor contratado por sessão."
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Convênio</TH>
                    <TH>Registro ANS</TH>
                    <TH className="text-right">Valor da sessão</TH>
                    <TH className="text-right">A faturar</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {plans.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-medium">{p.name}</TD>
                      <TD className="tabular-nums">{p.ansRegistry}</TD>
                      <TD className="text-right">{formatBRL(p.sessionPrice)}</TD>
                      <TD className="text-right">{plural(p.appointments.length, "sessão", "sessões")}</TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/app/convenios/${p.id}`}>Faturar</Link>
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Novo convênio</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createPlanAction} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="name">Nome da operadora</Label>
                  <Input id="name" name="name" required placeholder="Unimed Goiânia" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ansRegistry">Registro ANS</Label>
                  <Input id="ansRegistry" name="ansRegistry" required inputMode="numeric" placeholder="000000" maxLength={6} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="providerCode">Código do prestador na operadora (opcional)</Label>
                  <Input id="providerCode" name="providerCode" maxLength={14} placeholder="Sem código, usa o CNPJ" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sessionPrice">Valor contratado por sessão (R$)</Label>
                  <Input id="sessionPrice" name="sessionPrice" type="number" step="0.01" min="0.01" required />
                </div>
                <Button type="submit" className="w-full">
                  Cadastrar convênio
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do prestador</CardTitle>
              <CardDescription>Vão em todas as guias. Sem CNES, a guia usa {CNES_NAO_INFORMADO}, como orienta a ANS.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={saveProviderAction} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cnpj">CNPJ do consultório</Label>
                  <Input id="cnpj" name="cnpj" defaultValue={ctx.workspace.cnpj ?? ""} placeholder="00.000.000/0000-00" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cnes">CNES (opcional)</Label>
                  <Input id="cnes" name="cnes" defaultValue={ctx.workspace.cnes ?? ""} inputMode="numeric" maxLength={7} placeholder="0000000" />
                </div>
                <Button type="submit" variant="outline" className="w-full">
                  Salvar dados do prestador
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
