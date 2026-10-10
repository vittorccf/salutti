// Guardas da Salutti Odonto (só no servidor). Odontograma é conteúdo clínico (prontuário, Res. CFO 174/92): só papel
// clínico. Planos e orçamentos: quem cadastra pacientes ou recebe (a recepção apresenta o orçamento); aprovar gera
// cobranças e cabe a quem administra as finanças (financeiro.pagar); marcar realizado é ato clínico. Em clínica, o dentista vê os
// próprios pacientes (mesmo escopo do portal).
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { Module } from "@/lib/areas";
import { requireModule } from "@/lib/modules";
import { can, canManagePayables, canSeeClinical } from "@/lib/permissions";
import { portalPatientScope } from "@/lib/portal";

type Ctx = Awaited<ReturnType<typeof requireModule>>;

// A sessão de suporte é somente leitura: nenhum botão de escrita aparece para ela (e o banco recusaria).
const writable = (ctx: Ctx) => !ctx.support;
export const canPlans = (ctx: Ctx) => can(ctx, "pacientes.gerenciar") || can(ctx, "financeiro.receber");
export const canEditPlans = (ctx: Ctx) => writable(ctx) && can(ctx, "pacientes.gerenciar");
// Aprovar (gera parcelas), cancelar plano aprovado e mexer na tabela de preços: quem administra as finanças
// (dono, administrador, financeiro; "financeiro.pagar"), não o dentista de uma clínica.
export const canApprovePlans = (ctx: Ctx) => writable(ctx) && canManagePayables(ctx);
export const canEditTable = (ctx: Ctx) => writable(ctx) && canManagePayables(ctx);
export const canClinical = (ctx: Ctx) => canSeeClinical(ctx);
export const canClinicalWrite = (ctx: Ctx) => writable(ctx) && canSeeClinical(ctx);
export const canManageLab = (ctx: Ctx) => writable(ctx) && can(ctx, "pacientes.gerenciar");

export async function requireOdonto(module: Module = "odontograma", check?: (ctx: Ctx) => boolean) {
  const ctx = await requireModule(module);
  if (check && !check(ctx)) notFound();
  return ctx;
}

export const patientScope = (ctx: Ctx) => portalPatientScope(ctx);

// Paciente do consultório, ativo e no escopo de quem vê (404 se não).
export async function findPatient(ctx: Ctx, id: string) {
  const patient = await db.patient.findFirst({
    where: { id, workspaceId: ctx.workspace.id, deletedAt: null, ...patientScope(ctx) },
    select: { id: true, fullName: true, phone: true, birthDate: true },
  });
  if (!patient) notFound();
  return patient;
}

// Plano do consultório com o paciente no escopo (404 se não).
export async function findPlan(ctx: Ctx, id: string) {
  const plan = await db.treatmentPlan.findFirst({
    where: { id, workspaceId: ctx.workspace.id, patient: { deletedAt: null, ...patientScope(ctx) } },
    include: {
      patient: { select: { id: true, fullName: true, phone: true, cpf: true, responsibleName: true } },
      professional: { select: { id: true, fullName: true, councilType: true, councilNumber: true, councilUF: true } },
      items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { professional: { select: { fullName: true } } } },
      charges: { orderBy: { installment: "asc" }, select: { id: true, amount: true, dueDate: true, status: true, installment: true } },
    },
  });
  if (!plan) notFound();
  return plan;
}
