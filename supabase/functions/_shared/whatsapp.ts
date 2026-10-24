// WhatsApp Business Platform (Cloud API). Credenciais SOMENTE em segredos:
//   WHATSAPP_GRAPH_VERSION         versão da Graph API (definida na configuração da conta Meta)
//   WHATSAPP_ACCESS_TOKEN_<UNIDADE> token permanente do sistema por unidade (ex.: _GERAL, _VIP)
//   WHATSAPP_APP_SECRET            segredo do app (assinatura do webhook)
//   WHATSAPP_VERIFY_TOKEN          token de verificação do webhook
// Nenhum valor é presumido: sem eles, as funções respondem 503 e nada é enviado.
import { HttpError } from "./http.ts";

export function graphBase(): string {
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION");
  if (!version || !/^v\d+\.\d+$/.test(version)) {
    throw new HttpError(503, "whatsapp_not_configured", "WhatsApp não configurado (versão da Graph API ausente)");
  }
  return `https://graph.facebook.com/${version}`;
}

export function unitToken(unitCode: string): string {
  const token = Deno.env.get(`WHATSAPP_ACCESS_TOKEN_${unitCode.toUpperCase()}`);
  if (!token) throw new HttpError(503, "whatsapp_not_configured", "Credencial oficial do WhatsApp ausente para a unidade");
  return token;
}

export async function graphRequest(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${graphBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verifica X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o segredo do app).
export async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!secret) throw new HttpError(503, "whatsapp_not_configured", "Segredo do app ausente");
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, header.slice(7));
}
