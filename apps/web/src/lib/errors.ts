// Tradução de erros do banco/PostgREST para mensagens claras em português.
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const known: Record<string, string> = {
  "42501": "Você não tem permissão para esta ação.",
  "23P01": "Conflito de horário: este profissional já tem atendimento nesse horário.",
  "23505": "Já existe um registro com esses dados.",
  "23503": "Registro relacionado inválido ou de outra unidade.",
  "22023": "Dados inválidos.",
  PGRST116: "Registro não encontrado.",
  PGRST301: "Sua sessão expirou. Entre novamente.",
};

// Mensagens de regra de negócio escritas em português pelo próprio banco
// (RAISE EXCEPTION) são exibidas como estão.
function isPortugueseBusinessMessage(msg: string): boolean {
  return /[ãçéêíóôõú]|não|Não|permissão|Ninguém|obrigatório|inválid/.test(msg) && !/violates|duplicate key/.test(msg);
}

export function errorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const e = err as DbErrorLike;
  if (e.message && isPortugueseBusinessMessage(e.message)) return e.message;
  if (e.code === "23514") return "Os dados não atendem às regras do cadastro.";
  if (e.code && known[e.code]) return known[e.code];
  if (e.message?.includes("row-level security")) return known["42501"];
  if (e.message?.includes("Failed to fetch")) return "Sem conexão com o servidor.";
  return e.message ?? "Ocorreu um erro inesperado.";
}
