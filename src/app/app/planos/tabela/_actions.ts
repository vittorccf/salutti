"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isSpecialty, isToothResult, SUGGESTED_PROCEDURES } from "@/lib/odonto";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { canEditTable, requireOdonto } from "@/app/app/odonto/_lib";

const str = (fd: FormData, k: string, max = 160) => String(fd.get(k) ?? "").trim().slice(0, max);
const PATH = "/app/planos/tabela";

// Inclui ou edita um procedimento da tabela do consultório.
export async function saveProcedureAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditTable);
  const t = await getTranslations("odonto.table");
  const id = str(fd, "id") || null;
  const name = str(fd, "name");
  if (name.length < 2) return { erro: t("errors.name") };
  const specialty = str(fd, "specialty");
  if (!isSpecialty(specialty)) return { erro: t("errors.generic") };
  const priceRaw = str(fd, "price").replace(/\./g, "").replace(",", ".");
  const price = priceRaw ? Number(priceRaw) : null;
  if (price !== null && !(Number.isFinite(price) && price >= 0 && price <= 1_000_000)) return { erro: t("errors.price") };
  const tussCode = str(fd, "tussCode", 12).replace(/\D/g, "") || null;
  if (tussCode && tussCode.length !== 8) return { erro: t("errors.tuss") };
  const toothResult = str(fd, "toothResult");
  const months = Number(str(fd, "returnMonths") || "0");
  const data = {
    name,
    specialty,
    tussCode,
    price: price === null ? null : Math.round(price * 100) / 100,
    perTooth: fd.get("perTooth") === "on",
    toothResult: isToothResult(toothResult) ? toothResult : null,
    returnMonths: Number.isInteger(months) && months > 0 && months <= 24 ? months : null,
  };
  if (id) {
    const res = await db.dentalProcedure.updateMany({ where: { id, workspaceId: ctx.workspace.id }, data });
    if (!res.count) return { erro: t("errors.generic") };
  } else {
    await db.dentalProcedure.create({ data: { ...data, workspaceId: ctx.workspace.id } });
  }
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: id ? "odonto.procedure.update" : "odonto.procedure.create", entity: "DentalProcedure", entityId: id ?? name });
  revalidatePath(PATH);
  return { ok: t("saved", { name }) };
}

export async function toggleProcedureAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditTable);
  const t = await getTranslations("odonto.table");
  const p = await db.dentalProcedure.findFirst({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  if (!p) return { erro: t("errors.generic") };
  await db.dentalProcedure.update({ where: { id: p.id }, data: { active: !p.active } });
  revalidatePath(PATH);
  return { ok: p.active ? t("deactivated") : t("activated") };
}

// Primeira carga: os procedimentos mais comuns, sem preço nem código (o consultório completa com a sua tabela).
export async function loadSuggestedAction(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  const ctx = await requireOdonto("odontograma", canEditTable);
  const t = await getTranslations("odonto.table");
  const ts = await getTranslations("odonto.suggested");
  const existing = new Set((await db.dentalProcedure.findMany({ where: { workspaceId: ctx.workspace.id }, select: { name: true } })).map((p) => p.name));
  const rows = SUGGESTED_PROCEDURES.map((p) => ({
    workspaceId: ctx.workspace.id,
    name: ts(p.key),
    specialty: p.specialty,
    perTooth: p.perTooth,
    toothResult: p.toothResult ?? null,
    returnMonths: p.returnMonths ?? null,
  })).filter((r) => !existing.has(r.name));
  if (rows.length) await db.dentalProcedure.createMany({ data: rows });
  await recordAudit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, action: "odonto.procedure.suggested", entity: "Workspace", entityId: ctx.workspace.id, metadata: { count: rows.length } });
  revalidatePath(PATH);
  // O cartão da tabela sugerida some quando a tabela ganha itens: a confirmação vai pela URL.
  redirect(`${PATH}?carregados=${rows.length}`);
}
