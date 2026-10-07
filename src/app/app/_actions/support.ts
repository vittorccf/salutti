"use server";
// Actions do toggle de suporte (a interface ainda não existe; ver docs/BACKOFFICE.md). Os chamados chegam em /backoffice/chamados.
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth";
import type { FormResult } from "@/components/forms/action-form";
import { addClientMessage, newTicketSchema, openTicket, replySchema } from "@/lib/support";

const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() ? v : undefined;
};

export async function openSupportTicketAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  const parsed = newTicketSchema.safeParse({
    category: field(formData, "category"),
    subject: field(formData, "subject"),
    message: field(formData, "message"),
    pageUrl: field(formData, "pageUrl"),
    userAgent: field(formData, "userAgent"),
    viewport: field(formData, "viewport"),
    appVersion: field(formData, "appVersion"),
  });
  if (!parsed.success) return { erro: "Preencha o assunto (3+ letras) e descreva o que aconteceu." };
  try {
    const ticket = await openTicket(
      { userId: ctx.user.id, workspaceId: ctx.workspace.id, name: ctx.user.name, email: ctx.user.email, locale: ctx.user.locale },
      parsed.data,
    );
    return { ok: `Chamado #${ticket.number} aberto. Responderemos por aqui.` };
  } catch (e) {
    if (e instanceof Error && e.message === "limite") return { erro: "Muitos chamados em pouco tempo. Tente de novo em uma hora." };
    throw e;
  }
}

export async function replySupportTicketAction(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireContext();
  const parsed = replySchema.safeParse({ ticketId: field(formData, "ticketId"), message: field(formData, "message") });
  if (!parsed.success) return { erro: "Escreva a mensagem." };
  try {
    await addClientMessage(ctx.user.id, parsed.data.ticketId, parsed.data.message);
  } catch {
    return { erro: "Chamado não encontrado." };
  }
  revalidatePath("/app", "layout");
  return { ok: "Mensagem enviada." };
}
