"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword, setActiveWorkspaceCookie } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { recordAudit } from "@/lib/audit";
import { defaultTemplateFor } from "@/lib/anamnesis-library";
import { isAccountType, segmentAllowed } from "@/lib/account";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";
import { parseDateOnly } from "@/lib/dates";
import { ContactError, validEmail } from "@/lib/contact-validation";
import type { FormResult } from "@/components/forms/action-form";

const schema = z.object({
  accountType: z.string().refine(isAccountType, "Escolha se a conta é de profissional autônomo ou de clínica."),
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(200),
  workspaceName: z.string().trim().max(120).optional(),
  segment: z.string(),
  cnpj: z.string().trim().max(20).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function signupAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const d = parsed.data;
  const accountType = d.accountType as "autonomo" | "clinica";
  if (!segmentAllowed(accountType, d.segment)) return { erro: "Escolha a área de atendimento." };

  // Clínica precisa de nome próprio; autônomo pode deixar em branco (vira "Consultório de <nome>").
  const workspaceName = d.workspaceName || (accountType === "autonomo" ? `Consultório de ${d.name.split(" ")[0]}` : "");
  if (workspaceName.length < 2) return { erro: "Informe o nome da clínica." };
  if (accountType === "clinica" && d.cnpj && !isValidCnpj(d.cnpj)) return { erro: "CNPJ inválido. Confira os números." };

  let email: string;
  try {
    email = (await validEmail(formData.get("email"), { required: true }))!;
  } catch (e) {
    if (e instanceof ContactError) return { erro: e.message };
    throw e;
  }
  if (await db.user.findUnique({ where: { email } })) return { erro: "Este e-mail já tem conta. Entre ou recupere o acesso." };

  const trial = new Date();
  trial.setDate(trial.getDate() + 15);

  const slugBase = slugify(workspaceName);
  let slug = slugBase;
  let i = 1;
  while (await db.workspace.findUnique({ where: { slug } })) slug = `${slugBase}-${i++}`;

  // Modelo de anamnese padrão da área de atendimento escolhida (biblioteca).
  const template = defaultTemplateFor(d.segment);
  const birthDate = d.birthDate ? parseDateOnly(d.birthDate) : null;

  const { user, workspace } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: d.name, passwordHash: await hashPassword(d.password), birthDate },
    });
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug,
        accountType,
        segment: d.segment,
        cnpj: accountType === "clinica" && d.cnpj ? formatCnpj(d.cnpj) : null,
        trialEndsAt: trial,
        memberships: { create: { userId: user.id, role: "owner" } },
        anamnesisTemplates: {
          create: [{ name: template.name, specialty: template.specialty, isDefault: true, schemaJson: JSON.stringify(template.schema) }],
        },
      },
    });
    return { user, workspace };
  });

  await recordAudit({
    workspaceId: workspace.id,
    userId: user.id,
    action: "workspace.create",
    entity: "Workspace",
    entityId: workspace.id,
    metadata: { accountType, segment: d.segment },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name });
  setActiveWorkspaceCookie(workspace.id);
  redirect("/app/primeiros-passos");
}
