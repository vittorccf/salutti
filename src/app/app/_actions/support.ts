"use server";
// Actions do botão de suporte (src/app/app/_components/support). Os chamados chegam em /backoffice/chamados.
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth";
import { getTranslations } from "@/i18n/server";
import type { FormResult } from "@/components/forms/action-form";
import { addClientMessage, markReadByClient, newTicketSchema, openTicket, replySchema } from "@/lib/support";

export type SupportResult = { erro?: string; ok?: string; number?: number } | null;

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() ? v : undefined;
};

const isLimit = (e: unknown) => e instanceof Error && e.message === "limite";

export async function openSupportTicketAction(_prev: SupportResult, formData: FormData): Promise<SupportResult> {
  const ctx = await requireContext();
  const t = await getTranslations("support.errors");
  const parsed = newTicketSchema.safeParse({
    category: field(formData, "category"),
    subject: field(formData, "subject"),
    message: field(formData, "message"),
    pageUrl: field(formData, "pageUrl"),
    userAgent: field(formData, "userAgent"),
    viewport: field(formData, "viewport"),
    appVersion: field(formData, "appVersion"),
  });
  if (!parsed.success) return { erro: t("invalid") };
  try {
    const ticket = await openTicket(
      { userId: ctx.user.id, workspaceId: ctx.workspace.id, name: ctx.user.name, email: ctx.user.email, locale: ctx.user.locale },
      parsed.data,
    );
    revalidatePath("/app", "layout");
    return { ok: "sent", number: ticket.number };
  } catch (e) {
    if (isLimit(e)) return { erro: t("limit") };
    throw e;
  }
}

export async function replySupportTicketAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  const t = await getTranslations("support");
  const parsed = replySchema.safeParse({ ticketId: field(formData, "ticketId"), message: field(formData, "message") });
  if (!parsed.success) return { erro: t("errors.empty") };
  try {
    await addClientMessage(ctx.user.id, parsed.data.ticketId, parsed.data.message);
  } catch (e) {
    return { erro: isLimit(e) ? t("errors.limit") : t("errors.notFound") };
  }
  revalidatePath("/app", "layout");
  return { ok: t("mine.replied") };
}

// Abrir um chamado no painel apaga o ponto de "resposta nova" dele.
export async function markSupportReadAction(ticketId: string) {
  const ctx = await requireContext();
  await markReadByClient(ctx.user.id, ticketId);
  revalidatePath("/app", "layout");
}
