"use server";
import { errorMessage } from "@/i18n/errors";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { autonomoBlockers, isAccountType, segmentAfterMigration } from "@/lib/account";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { ContactError, readAddress } from "@/lib/contact-validation";
import type { FormResult } from "@/components/forms/action-form";
import { UploadError } from "@/lib/media";
import { stageImage, type StagedImage } from "@/lib/media-store";



// Perfil do próprio usuário: vale em todos os consultórios de que ele participa.
export async function updateProfileAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe seu nome.").max(120),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  let avatar: StagedImage;
  try {
    avatar = await stageImage(formData, "avatar", ctx.user.avatarId, "user_avatar", { userId: ctx.user.id });
  } catch (e) {
    if (e instanceof UploadError) return { erro: await errorMessage(e) };
    throw e;
  }
  await db.user
    .update({
      where: { id: ctx.user.id },
      data: {
        avatarId: avatar.id,
      name: parsed.data.name,
      birthDate: parsed.data.birthDate ? parseDateOnly(parsed.data.birthDate) : null,
        showPatientBirthdays: formData.get("showPatientBirthdays") === "on",
        locale: isLocale(formData.get("locale")) ? String(formData.get("locale")) : null,
      },
    })
    .catch(async (e) => {
      await avatar.rollback();
      throw e;
    });
  await avatar.commit();
  // O idioma vale já nesta resposta e nos próximos acessos (o cookie é lido em src/i18n/request.ts).
  const locale = formData.get("locale");
  if (isLocale(locale)) cookies().set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else cookies().delete(LOCALE_COOKIE);
  revalidatePath("/app", "layout");
  return { ok: "Perfil salvo." };
}

// Dados do consultório/clínica (nome, CNPJ, endereço): dono ou administrador.
export async function updateWorkspaceAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  if (ctx.role !== "owner" && ctx.role !== "admin") return { erro: "Só o dono ou um administrador altera estes dados." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 120) return { erro: "Informe o nome." };
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim();
  // CNPJ que já estava salvo e não mudou não é revalidado (cadastros antigos não travam o formulário).
  const cnpjChanged = cnpjRaw !== (ctx.workspace.cnpj ?? "");
  if (cnpjRaw && cnpjChanged && !isValidCnpj(cnpjRaw)) return { erro: "CNPJ inválido. Confira os números." };
  let address;
  try {
    address = readAddress(formData);
  } catch (e) {
    if (e instanceof ContactError) return { erro: await errorMessage(e) };
    throw e;
  }
  const brand = z.enum(["salutti", "photo", "banner"]).safeParse(formData.get("brandDisplay") ?? "salutti");
  if (!brand.success) return { erro: "Escolha o que aparece no menu." };
  const brandDisplay = brand.data;
  let banner: StagedImage;
  try {
    banner = await stageImage(formData, "banner", ctx.workspace.bannerId, "workspace_banner", { workspaceId: ctx.workspace.id });
  } catch (e) {
    if (e instanceof UploadError) return { erro: await errorMessage(e) };
    throw e;
  }
  if (brandDisplay === "banner" && !banner.id) {
    await banner.rollback();
    return { erro: "Envie o banner para usá-lo no menu." };
  }
  await db.workspace
    .update({
      where: { id: ctx.workspace.id },
      data: {
        brandDisplay,
        bannerId: banner.id,
        name,
        cnpj: cnpjRaw ? (cnpjChanged ? formatCnpj(cnpjRaw) : ctx.workspace.cnpj) : null,
        ...address,
      },
    })
    .catch(async (e) => {
      await banner.rollback();
      throw e;
    });
  await banner.commit();
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.update",
    entity: "Workspace",
    entityId: ctx.workspace.id,
  });
  revalidatePath("/app", "layout");
  return { ok: "Dados salvos." };
}

// Troca autônomo ↔ clínica. Só o dono. Para virar autônomo, a conta precisa caber em um profissional e um usuário;
// nada é apagado na troca (pacientes, agenda, prontuário e financeiro ficam como estão).
export async function changeAccountTypeAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  if (ctx.role !== "owner") return { erro: "Só quem é dono da conta pode mudar o tipo." };
  const to = formData.get("to");
  if (!isAccountType(to) || to === ctx.workspace.accountType) return { erro: "Escolha o novo tipo de conta." };

  if (to === "autonomo") {
    const [activeProfessionals, members] = await Promise.all([
      db.professional.count({ where: { workspaceId: ctx.workspace.id, active: true } }),
      db.membership.count({ where: { workspaceId: ctx.workspace.id, role: { notIn: ["receptionist", "financial"] } } }),
    ]);
    const blockers = autonomoBlockers({ activeProfessionals, members });
    if (blockers.length) return { erro: `Ainda não dá para virar conta de autônomo: ${blockers.join("; ")}.` };
  }

  const segment = segmentAfterMigration(to, ctx.workspace.segment);
  await db.workspace.update({ where: { id: ctx.workspace.id }, data: { accountType: to, segment } });
  await recordAudit({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    action: "workspace.account_type",
    entity: "Workspace",
    entityId: ctx.workspace.id,
    metadata: { from: ctx.workspace.accountType, to, segment },
  });
  revalidatePath("/app", "layout");
  return { ok: to === "clinica" ? "Pronto: a conta agora é de clínica." : "Pronto: a conta agora é de profissional autônomo." };
}
