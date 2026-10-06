"use server";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { libraryTemplate } from "@/lib/anamnesis-library";

// Copia modelos da biblioteca para o consultório (ignora os que já foram adicionados).
export async function addLibraryTemplatesAction(formData: FormData) {
  const ctx = await requireContext();
  const back = formData.get("back") === "ajustes" ? "/app/ajustes" : "/app/primeiros-passos";
  const slugs = formData.getAll("slug").map(String);
  const existing = await db.anamnesisTemplate.findMany({
    where: { workspaceId: ctx.workspace.id },
    select: { name: true, isDefault: true },
  });
  const hasDefault = existing.some((t) => t.isDefault);
  let first = !hasDefault;
  for (const slug of slugs) {
    const tpl = libraryTemplate(slug);
    if (!tpl || existing.some((t) => t.name === tpl.name)) continue;
    const created = await db.anamnesisTemplate.create({
      data: {
        workspaceId: ctx.workspace.id,
        name: tpl.name,
        specialty: tpl.specialty,
        isDefault: first,
        schemaJson: JSON.stringify(tpl.schema),
      },
    });
    first = false;
    await recordAudit({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      action: "anamnesis_template.add",
      entity: "AnamnesisTemplate",
      entityId: created.id,
      metadata: { slug },
    });
  }
  redirect(back);
}
