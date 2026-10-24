// Webhook oficial do WhatsApp (chamado pela Meta, sem JWT).
// GET: verificação do webhook (hub.verify_token). POST: eventos assinados
// (X-Hub-Signature-256) — mensagens recebidas, status de entrega, opt-out por
// palavra-chave. Assinatura inválida é recusada antes de qualquer gravação.
import { HttpError } from "../_shared/http.ts";
import { AdminApi } from "../_shared/supabase.ts";
import { verifySignature } from "../_shared/whatsapp.ts";

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
      if (!expected) return text(503, "not configured");
      if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== expected) {
        return text(403, "forbidden");
      }
      const { error } = await new AdminApi().rpc("messaging_mark_channel", { p_unit_code: "", p_field: "webhook" });
      if (error) console.error(JSON.stringify({ fn: "whatsapp-webhook", requestId, context: "mark_webhook" }));
      return text(200, url.searchParams.get("hub.challenge") ?? "");
    }
    if (req.method !== "POST") return text(405, "method not allowed");

    const raw = await req.text();
    if (raw.length > 512 * 1024) return text(413, "too large");
    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256")))) {
      return text(401, "invalid signature");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return text(400, "invalid json");
    }
    const { data, error } = await new AdminApi().rpc<Record<string, number>>("whatsapp_ingest", { p_payload: payload });
    if (error) {
      console.error(JSON.stringify({ fn: "whatsapp-webhook", requestId, context: "ingest", code: error.code }));
      return text(500, "error");
    }
    console.log(JSON.stringify({ fn: "whatsapp-webhook", requestId, result: data }));
    return text(200, "ok");
  } catch (err) {
    if (err instanceof HttpError) return text(err.status, err.code);
    console.error(JSON.stringify({ fn: "whatsapp-webhook", requestId, error: "unexpected" }));
    return text(500, "error");
  }
});
