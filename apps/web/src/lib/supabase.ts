import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em apps/web/.env.local");
}
if (/^sb_secret_/.test(publishableKey)) {
  throw new Error("Chave secreta detectada no frontend. Use somente a chave publicável.");
}

// Cliente único da aplicação: chave publicável + sessão do usuário.
// Toda autorização é feita pelo banco (RLS).
export const supabase = createClient<Database>(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
});

export const functionsUrl = `${url.replace(/\/$/, "")}/functions/v1`;

// Chama uma Edge Function com o JWT da sessão atual.
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: { ok?: boolean; error?: { code?: string; message?: string } } & Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    // resposta sem corpo
  }
  if (!res.ok || json.ok === false) {
    return { ok: false, status: res.status, code: json.error?.code, message: json.error?.message ?? "Falha na operação" };
  }
  return { ok: true, data: json as T };
}
