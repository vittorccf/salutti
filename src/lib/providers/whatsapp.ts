// Provider WhatsApp Business — MOCK
// Em produção: WhatsApp Cloud API (Meta) c/ templates aprovados.

import { db } from "../db";

type SendArgs = {
  workspaceId: string;
  recipient: string;
  template: string;
  vars: Record<string, string>;
};

export const whatsapp = {
  async send({ workspaceId, recipient, template, vars }: SendArgs) {
    const body = renderTemplate(template, vars);
    await db.notificationLog.create({
      data: {
        workspaceId,
        channel: "whatsapp",
        recipient,
        template,
        payload: JSON.stringify({ vars, body }),
        status: "sent",
      },
    });
    return { id: `wa_${Date.now()}`, body };
  },
};

const renderTemplate = (template: string, vars: Record<string, string>) => {
  const templates: Record<string, string> = {
    reminder_24h:
      "Olá, {{patient}}! Lembrete da consulta com {{professional}} em {{when}}. Confirma sua presença respondendo SIM.",
    reminder_2h:
      "Oi, {{patient}}! Sua sessão começa em 2h ({{when}}). Link: {{meeting}}",
    charge_due:
      "Olá, {{patient}}. Sua cobrança no valor de {{amount}} vence em {{due}}. PIX (copia-e-cola): {{pix}}",
    charge_overdue:
      "Oi, {{patient}}. Sua fatura de {{amount}} ficou em atraso. Para regularizar: {{link}}",
    receipt_issued:
      "Pronto, {{patient}}! Seu recibo {{receipt}} foi emitido e enviado à Receita Saúde.",
  };
  let body = templates[template] ?? template;
  for (const [k, v] of Object.entries(vars)) body = body.replaceAll(`{{${k}}}`, v);
  return body;
};
