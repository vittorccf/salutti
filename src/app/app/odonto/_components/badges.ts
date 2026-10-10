// Cor do selo de situação (sempre com a palavra ao lado): plano, item, prótese e retorno.
export const PLAN_BADGE: Record<string, "warning" | "success" | "muted" | "default" | "destructive"> = {
  em_estudo: "warning",
  aprovado: "default",
  concluido: "success",
  recusado: "muted",
  cancelado: "muted",
};
export const ITEM_BADGE: Record<string, "warning" | "success" | "muted"> = { planejado: "warning", realizado: "success", cancelado: "muted" };
export const LAB_BADGE: Record<string, "warning" | "success" | "muted" | "default" | "destructive"> = {
  a_enviar: "muted",
  enviado: "default",
  em_prova: "warning",
  recebido: "success",
  instalado: "success",
  refazer: "destructive",
  cancelado: "muted",
};
