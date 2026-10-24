// Helpers dos testes de integração: usuários reais no Auth da stack local,
// login com senha, MFA TOTP e chamadas às Edge Functions e ao REST.
// Somente para a stack local (supabase start). Nunca apontar para produção.
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface LocalEnv {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
  MAILPIT_URL: string;
}

let cached: LocalEnv | null = null;
export function env(): LocalEnv {
  if (cached) return cached;
  const raw = execSync("supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const parsed = JSON.parse(raw) as LocalEnv;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(parsed.API_URL)) {
    throw new Error("Testes de integração só rodam contra a stack local");
  }
  cached = parsed;
  return parsed;
}

export const ORIGIN = "http://localhost:5173";
export const PASSWORD = "SenhaDeTeste123";

export function admin(): SupabaseClient {
  return createClient(env().API_URL, env().SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  return createClient(env().API_URL, env().PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const run = randomUUID().slice(0, 8);
export function testEmail(name: string): string {
  return `${name}.${run}@teste.invalid`;
}

export async function unitId(code: string): Promise<string> {
  const { data, error } = await admin().from("units").select("id").eq("code", code).single();
  if (error) throw error;
  return data.id as string;
}

export async function profileId(key: string): Promise<string> {
  const { data, error } = await admin().from("access_profiles").select("id").eq("key", key).single();
  if (error) throw error;
  return data.id as string;
}

// Cria pessoa diretamente como administrador (equivalente ao bootstrap).
export async function createPerson(
  name: string,
  links: { unit: string; profile: string }[],
  opts: { platformAdmin?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const a = admin();
  const email = testEmail(name);
  const { data, error } = await a.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser");
  const id = data.user.id;
  const p = await a.from("profiles").insert({ id, full_name: `Teste ${name}` });
  if (p.error) throw p.error;
  if (opts.platformAdmin) {
    const r = await a.from("platform_admins").insert({ user_id: id });
    if (r.error) throw r.error;
  }
  for (const l of links) {
    const r = await a.from("unit_memberships").insert({
      user_id: id,
      unit_id: await unitId(l.unit),
      access_profile_id: await profileId(l.profile),
    });
    if (r.error) throw r.error;
  }
  return { id, email };
}

export async function signIn(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

// TOTP (RFC 6238) com SHA-1, 6 dígitos, 30 s — o mesmo do Supabase Auth.
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const offset = h[h.length - 1] & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

// Cadastra e verifica um fator TOTP; a sessão do cliente passa a aal2.
// Retorna o segredo TOTP (para gerar códigos em novos logins).
export async function enrollMfa(c: SupabaseClient): Promise<string> {
  const { data, error } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: `teste-${randomUUID()}` });
  if (error) throw error;
  const secret = data.totp.secret;
  const v = await c.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(secret) });
  if (v.error) throw v.error;
  return secret;
}

export async function callFunction(
  name: string,
  body: unknown,
  c?: SupabaseClient,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: { ok: boolean; error?: { code: string; message: string }; [k: string]: unknown } }> {
  const h: Record<string, string> = { "Content-Type": "application/json", Origin: ORIGIN, ...headers };
  if (c) {
    const { data } = await c.auth.getSession();
    if (data.session) h.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${env().API_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: h,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function mailpitHasMessageTo(email: string): Promise<boolean> {
  const res = await fetch(`${env().MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { messages_count?: number; total?: number };
  return (data.messages_count ?? data.total ?? 0) > 0;
}
