// Utilitários HTTP comuns às Edge Functions do RC Beauty.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  if (!raw) throw new Error("ALLOWED_ORIGINS não configurado");
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

// Envolve o handler: CORS, método, limite de corpo, erros padronizados e log
// sem dados pessoais.
export function handler(
  name: string,
  maxBodyBytes: number,
  fn: (req: Request, body: unknown) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    let status = 500;
    try {
      if (req.method === "OPTIONS") {
        status = 204;
        return new Response(null, { status, headers: corsHeaders(req) });
      }
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Método não permitido");
      const origin = req.headers.get("origin");
      if (origin && !allowedOrigins().includes(origin)) {
        throw new HttpError(403, "origin_not_allowed", "Origem não autorizada");
      }
      const text = await req.text();
      if (new TextEncoder().encode(text).length > maxBodyBytes) {
        throw new HttpError(413, "payload_too_large", "Requisição muito grande");
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, "invalid_json", "JSON inválido");
      }
      const res = await fn(req, body);
      status = res.status;
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        return json(req, err.status, { ok: false, error: { code: err.code, message: err.message } });
      }
      console.error(JSON.stringify({ fn: name, requestId, error: err instanceof Error ? err.message : "erro" }));
      status = 500;
      return json(req, 500, { ok: false, error: { code: "internal_error", message: "Erro interno" } });
    } finally {
      console.log(JSON.stringify({ fn: name, requestId, status, ms: Date.now() - started }));
    }
  };
}

// Validação mínima e estrita de objetos JSON.
export function asObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "invalid_body", "Corpo deve ser um objeto JSON");
  }
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length) throw new HttpError(400, "unknown_fields", `Campos não permitidos: ${extra.join(", ")}`);
  return value as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new HttpError(400, "invalid_field", `${field} inválido`);
  }
  return value.toLowerCase();
}

export function text(value: unknown, field: string, min: number, max: number, optional = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (optional) return null;
    throw new HttpError(400, "invalid_field", `${field} é obrigatório`);
  }
  if (typeof value !== "string") throw new HttpError(400, "invalid_field", `${field} inválido`);
  const v = value.trim();
  if (v.length < min || v.length > max) {
    throw new HttpError(400, "invalid_field", `${field} deve ter entre ${min} e ${max} caracteres`);
  }
  return v;
}

export function email(value: unknown): string {
  const v = text(value, "email", 5, 254)!.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new HttpError(400, "invalid_field", "email inválido");
  return v;
}
