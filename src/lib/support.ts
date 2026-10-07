// Chamados de suporte: o cliente abre pelo toggle de suporte do app e a equipe responde no backoffice.
// Este arquivo é o contrato entre os dois lados (ver docs/BACKOFFICE.md, seção "Toggle de suporte").
import { z } from "zod";
import { db } from "@/lib/db";

export const TICKET_CATEGORIES = {
  bug: "Erro / bug",
  duvida: "Dúvida",
  sugestao: "Sugestão",
  financeiro: "Financeiro / plano",
  acesso: "Acesso / login",
  outro: "Outro",
} as const;

export const TICKET_STATUSES = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  resolvido: "Resolvido",
  fechado: "Fechado",
} as const;

export const TICKET_PRIORITIES = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
} as const;

export type TicketCategory = keyof typeof TICKET_CATEGORIES;
export type TicketStatus = keyof typeof TICKET_STATUSES;
export type TicketPriority = keyof typeof TICKET_PRIORITIES;

export const OPEN_STATUSES: TicketStatus[] = ["aberto", "em_andamento", "aguardando_cliente"];

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
export const categorySchema = z.enum(keys(TICKET_CATEGORIES));
export const statusSchema = z.enum(keys(TICKET_STATUSES));
export const prioritySchema = z.enum(keys(TICKET_PRIORITIES));

// Mais que isso por hora e por usuário é abuso ou laço no cliente.
export const MAX_TICKETS_PER_HOUR = 10;

// O que o toggle envia. Contexto técnico é opcional e truncado; nada de dados de paciente.
export const newTicketSchema = z.object({
  category: categorySchema.default("bug"),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(5).max(5000),
  pageUrl: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(500).optional(),
  viewport: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(40).optional(),
});
export type NewTicketInput = z.infer<typeof newTicketSchema>;

export const replySchema = z.object({
  ticketId: z.string().min(1),
  message: z.string().trim().min(1).max(5000),
});

// Só o caminho da página: query string pode carregar ids e termos de busca (ex.: nome de paciente).
export const sanitizePageUrl = (value?: string) => {
  if (!value) return null;
  try {
    return new URL(value, "https://salutti.local").pathname.slice(0, 300);
  } catch {
    return null;
  }
};

// Bug e acesso começam com prioridade alta: travam o uso do sistema.
export const defaultPriority = (category: TicketCategory): TicketPriority =>
  category === "bug" || category === "acesso" ? "alta" : "normal";

type Requester = { userId: string; workspaceId: string; name: string; email: string; locale?: string | null };

export const openTicket = async (requester: Requester, input: NewTicketInput) => {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db.supportTicket.count({ where: { userId: requester.userId, createdAt: { gte: since } } });
  if (recent >= MAX_TICKETS_PER_HOUR) throw new Error("limite");

  return db.supportTicket.create({
    data: {
      workspaceId: requester.workspaceId,
      userId: requester.userId,
      requesterName: requester.name,
      requesterEmail: requester.email,
      locale: requester.locale ?? null,
      category: input.category,
      priority: defaultPriority(input.category),
      subject: input.subject,
      pageUrl: sanitizePageUrl(input.pageUrl),
      userAgent: input.userAgent ?? null,
      viewport: input.viewport ?? null,
      appVersion: input.appVersion ?? null,
      messages: { create: { authorType: "cliente", userId: requester.userId, body: input.message } },
    },
  });
};

// Resposta do cliente num chamado dele. Chamado resolvido/fechado volta a "aberto" quando o cliente escreve.
export const addClientMessage = async (userId: string, ticketId: string, body: string) => {
  const ticket = await db.supportTicket.findFirst({ where: { id: ticketId, userId } });
  if (!ticket) throw new Error("not_found");
  const reopen = ticket.status === "resolvido" || ticket.status === "fechado" || ticket.status === "aguardando_cliente";
  await db.$transaction([
    db.supportMessage.create({ data: { ticketId, authorType: "cliente", userId, body } }),
    db.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastActivityAt: new Date(),
        unreadByStaff: true,
        ...(reopen ? { status: "aberto", resolvedAt: null } : {}),
      },
    }),
  ]);
};

// Chamados do próprio usuário, com as mensagens visíveis para ele (notas internas da equipe ficam de fora).
export const listClientTickets = (userId: string) =>
  db.supportTicket.findMany({
    where: { userId },
    orderBy: { lastActivityAt: "desc" },
    take: 50,
    include: { messages: { where: { internal: false }, orderBy: { createdAt: "asc" } } },
  });

export const markReadByClient = (userId: string, ticketId: string) =>
  db.supportTicket.updateMany({ where: { id: ticketId, userId }, data: { unreadByClient: false } });
