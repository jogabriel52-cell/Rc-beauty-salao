// Tipos de linhas do banco e rótulos de domínio em português.
import type { Tables } from "./database.types";

export type Service = Tables<"services">;
export type Professional = Tables<"professionals">;
export type Appointment = Tables<"appointments">;
export type ClientUnit = Tables<"client_units">;
export type ClientIdentity = Tables<"client_identities">;
export type CrmInteraction = Tables<"crm_interactions">;
export type Product = Tables<"products">;
export type ProductStock = Tables<"product_stock">;
export type StockMovement = Tables<"stock_movements">;
export type Sale = Tables<"sales">;
export type SaleItem = Tables<"sale_items">;
export type SalePayment = Tables<"sale_payments">;

export const APPOINTMENT_STATUS: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
};

export const SALE_STATUS: Record<string, string> = {
  aberta: "Aberta",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export const PAYMENT_METHOD: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_debito: "Cartão de débito",
  cartao_credito: "Cartão de crédito",
  voucher: "Voucher",
  outro: "Outro",
};

export const CRM_KIND: Record<string, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  whatsapp: "WhatsApp",
  visita: "Visita",
  email: "E-mail",
  outro: "Outro",
};

export const STOCK_KIND: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste",
  venda: "Venda",
  estorno_venda: "Estorno de venda",
};

// Cliente da unidade com a identidade embutida.
export interface ClientRow {
  id: string;
  unit_id: string;
  service_notes: string | null;
  archived_at: string | null;
  created_at: string;
  client_identities: { id: string; full_name: string; phone: string | null; email: string | null; birth_date: string | null };
}

export const CLIENT_SELECT =
  "id, unit_id, service_notes, archived_at, created_at, client_identities!inner(id, full_name, phone, email, birth_date)";

// Fase 4 — mensagens e relacionamento.
export type MessagingChannel = Tables<"messaging_channels">;
export type MessageTemplate = Tables<"message_templates">;
export type ConsentEvent = Tables<"consent_events">;
export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Followup = Tables<"followups">;
export type Survey = Tables<"surveys">;

export const CHANNEL_STATUS: Record<string, string> = {
  desativado: "Desativado",
  configurado: "Configurado (não ativo)",
  ativo: "Ativo",
  suspenso: "Suspenso",
};

export const MESSAGE_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  na_fila: "Enviando",
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
  falhou: "Falhou",
  recebida: "Recebida",
  descartada: "Descartada",
};

export const PURPOSE: Record<string, string> = { atendimento: "Atendimento", marketing: "Marketing" };

export const CONSENT_STATUS: Record<string, string> = {
  opt_in: "Autorizou",
  opt_out: "Pediu para não receber",
  sem_registro: "Sem registro",
};

export const CONSENT_SOURCE: Record<string, string> = {
  presencial: "Presencial (ficha/assinatura)",
  whatsapp: "Pelo WhatsApp",
  formulario: "Formulário",
  palavra_chave: "Palavra-chave (PARAR/SAIR)",
  outro: "Outro",
};

export const TEMPLATE_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado_para_aprovacao: "Em aprovação na Meta",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  pausado: "Pausado",
};

export const FOLLOWUP_KIND: Record<string, string> = {
  retorno: "Retorno",
  pos_atendimento: "Pós-atendimento",
  reengajamento: "Reengajamento",
  sdr: "Prospecção (SDR)",
  outro: "Outro",
};

export const FOLLOWUP_STATUS: Record<string, string> = { aberto: "Aberto", feito: "Feito", cancelado: "Cancelado" };

export const SURVEY_CHANNEL: Record<string, string> = {
  presencial: "Presencial",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  outro: "Outro",
};

export function consentTone(status: string): "success" | "danger" | "neutral" {
  return status === "opt_in" ? "success" : status === "opt_out" ? "danger" : "neutral";
}
