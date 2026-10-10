"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { cpfDigits, isValidCpf } from "@/lib/cpf";
import { canManagePayables, requirePermission } from "@/lib/permissions";
import { TAX_REGIMES } from "@/lib/tax";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { monthFiscal, payerReady } from "./_data";

const str = (fd: FormData, k: string, max = 40) => String(fd.get(k) ?? "").trim().slice(0, max);

// Perfil fiscal do consultório: regime, CPF do titular do carnê-leão, ocupação (Carnê-Leão Web) e dependentes.
// Quem administra as finanças (dono, administrador, financeiro) muda; quem só vê o fiscal, não.
export async function saveFiscalProfileAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requirePermission("fiscal.ver");
  const t = await getTranslations("fiscal.profile");
  if (ctx.support || !canManagePayables(ctx)) return { erro: t("errors.onlyFinance") };
  const regime = str(fd, "taxRegime");
  if (!(TAX_REGIMES as readonly string[]).includes(regime)) return { erro: t("errors.generic") };
  const cpfRaw = str(fd, "taxCpf");
  const cpf = cpfRaw ? cpfDigits(cpfRaw) : null;
  if (cpf && !isValidCpf(cpf)) return { erro: t("errors.cpf") };
  const occupation = str(fd, "taxOccupation", 6).replace(/\D/g, "") || null;
  const dependents = Number(str(fd, "taxDependents") || "0");
  if (!Number.isInteger(dependents) || dependents < 0 || dependents > 20) return { erro: t("errors.dependents") };
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { taxRegime: regime, taxCpf: cpf, taxOccupation: occupation, taxDependents: dependents } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "fiscal.profile", entity: "Workspace", entityId: ctx.workspace.id, metadata: { regime, occupation, dependents } });
  revalidatePath("/app/fiscal");
  return { ok: t("saved") };
}

// Depois de importar o CSV no Carnê-Leão Web, quem administra as finanças confirma: os recibos "a enviar" do período
// com CPF válido do pagador passam a "exportado". Separado do download para que baixar o arquivo não mude nada.
export async function markExportedAction(fd: FormData) {
  const ctx = await requirePermission("fiscal.ver");
  if (ctx.support || !canManagePayables(ctx)) redirect("/app/fiscal");
  const month = str(fd, "mes", 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) redirect("/app/fiscal");
  const { charges } = await monthFiscal(ctx.workspace.id, month);
  const ids = charges.filter((c) => c.receipt?.receitaSaudeStatus === "queued" && payerReady(c.patient)).map((c) => c.id);
  const { count } = await db.receipt.updateMany({ where: { workspaceId: ctx.workspace.id, chargeId: { in: ids }, receitaSaudeStatus: "queued" }, data: { receitaSaudeStatus: "sent" } });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "fiscal.imported", entity: "Workspace", entityId: ctx.workspace.id, metadata: { period: month, receipts: count } });
  revalidatePath("/app/fiscal");
  redirect(`/app/fiscal/carne-leao?mes=${month}&importados=${count}`);
}
