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
