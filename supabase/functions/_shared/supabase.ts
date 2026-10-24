// Acesso às APIs do Supabase a partir das Edge Functions, sem dependências
// externas (apenas fetch): menos cadeia de suprimentos e nenhum download de
// pacote no boot da função.
//
// - UserApi: chave publicável + JWT do chamador. RLS e auditoria registram o
//   ator real. Use para TODA gravação que o RLS permite.
// - AdminApi: chave secreta. Somente para endpoints administrativos do Auth e
//   funções SQL restritas a service_role. Nunca retornar, logar ou expor.
import { HttpError } from "./http.ts";

function key(kind: "publishable" | "secret"): string {
  const json = Deno.env.get(kind === "publishable" ? "SUPABASE_PUBLISHABLE_KEYS" : "SUPABASE_SECRET_KEYS");
  if (json) {
    const value = JSON.parse(json)["default"];
    if (value) return value;
  }
  const legacy = Deno.env.get(kind === "publishable" ? "SUPABASE_ANON_KEY" : "SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error(`Chave ${kind} indisponível`);
  return legacy;
}

function baseUrl(): string {
  const u = Deno.env.get("SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL indisponível");
  return u.replace(/\/$/, "");
}

export interface DbError {
  code?: string;
  message?: string;
}

export interface ApiResult<T> {
  data: T | null;
  error: DbError | null;
  status: number;
}

async function request<T>(path: string, init: RequestInit, headers: Record<string, string>): Promise<ApiResult<T>> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...headers, ...(init.headers as Record<string, string> ?? {}) },
  });
  const raw = await res.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!res.ok) {
    return {
      data: null,
      status: res.status,
      error: { code: body?.code ?? body?.error_code ?? String(res.status), message: body?.message ?? body?.msg },
    };
  }
  return { data: body as T, error: null, status: res.status };
}

class Api {
  constructor(protected headers: Record<string, string>) {}

  rpc<T>(fn: string, args: Record<string, unknown>): Promise<ApiResult<T>> {
    return request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, this.headers);
  }

  // query: filtros no formato PostgREST, ex.: "id=eq.<uuid>&select=id"
  select<T>(table: string, query: string): Promise<ApiResult<T>> {
    return request<T>(`/rest/v1/${table}?${query}`, { method: "GET" }, this.headers);
  }

  insert<T>(table: string, values: Record<string, unknown>): Promise<ApiResult<T>> {
    return request<T>(`/rest/v1/${table}`, {
      method: "POST",
      body: JSON.stringify(values),
      headers: { Prefer: "return=representation" },
    }, this.headers);
  }

  update<T>(table: string, query: string, values: Record<string, unknown>): Promise<ApiResult<T>> {
    return request<T>(`/rest/v1/${table}?${query}`, {
      method: "PATCH",
      body: JSON.stringify(values),
      headers: { Prefer: "return=representation" },
    }, this.headers);
  }
}

export class UserApi extends Api {}

export class AdminApi extends Api {
  constructor() {
    super({ apikey: key("secret") });
  }

  inviteUserByEmail(email: string, redirectTo: string): Promise<ApiResult<{ id: string }>> {
    return request(`/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }, this.headers);
  }

  updateUser(id: string, attrs: Record<string, unknown>): Promise<ApiResult<{ id: string }>> {
    return request(`/auth/v1/admin/users/${id}`, { method: "PUT", body: JSON.stringify(attrs) }, this.headers);
  }
}

export interface Caller {
  userId: string;
  api: UserApi;
}

// Valida o JWT do chamador com o Auth (rejeita token inválido, expirado ou de
// usuário bloqueado) e devolve um cliente que age como ele.
export async function requireCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new HttpError(401, "unauthenticated", "Sessão ausente");
  const headers = { apikey: key("publishable"), Authorization: `Bearer ${match[1]}` };
  const user = await request<{ id: string }>("/auth/v1/user", { method: "GET" }, headers);
  if (user.error || !user.data?.id) throw new HttpError(401, "unauthenticated", "Sessão inválida ou expirada");
  return { userId: user.data.id, api: new UserApi(headers) };
}

// Converte erro do PostgREST/Postgres em resposta HTTP sem detalhes internos.
export function dbError(error: DbError | null, context: string): never {
  if (error?.code === "42501") throw new HttpError(403, "forbidden", error.message ?? "Sem permissão");
  if (error?.code === "55000") throw new HttpError(503, "disabled", error.message ?? "Recurso desativado");
  if (error?.code === "23514" || error?.code === "22023" || error?.code === "23505") {
    throw new HttpError(400, "invalid_request", error.message ?? "Requisição inválida");
  }
  console.error(JSON.stringify({ context, code: error?.code ?? "unknown" }));
  throw new HttpError(500, "internal_error", "Erro interno");
}
