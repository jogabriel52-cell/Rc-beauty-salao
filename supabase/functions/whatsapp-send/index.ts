// Envia mensagem pelo WhatsApp oficial. Toda a autorização (permissão, canal
// ativo, consentimento, janela de 24 h, modelo aprovado) é feita pelo banco em
// messaging_prepare_send, com o JWT de quem envia. Sem credenciais: 503.
import { asObject, handler, HttpError, json, text, uuid } from "../_shared/http.ts";
import { AdminApi, dbError, requireCaller } from "../_shared/supabase.ts";
import { graphRequest, unitToken } from "../_shared/whatsapp.ts";

interface Prepared {
  message_id: string;
  unit_code: string;
  phone_number_id: string;
  to: string;
  body: string;
  template: { name: string; language: string } | null;
}

Deno.serve(handler("whatsapp-send", 8 * 1024, async (req, body) => {
  const caller = await requireCaller(req);
  const o = asObject(body, ["conversation_id", "body", "template_id", "draft_id", "variables"]);
  const conversationId = uuid(o.conversation_id, "conversation_id");
  const templateId = o.template_id ? uuid(o.template_id, "template_id") : null;
  const draftId = o.draft_id ? uuid(o.draft_id, "draft_id") : null;
  const messageBody = templateId ? null : text(o.body, "body", 1, 4096, !!draftId);
  const variables = Array.isArray(o.variables) ? o.variables.map((v) => String(v).slice(0, 200)).slice(0, 10) : [];

  const { data: prepared, error } = await caller.api.rpc<Prepared>("messaging_prepare_send", {
    p_conversation_id: conversationId, p_body: messageBody, p_template_id: templateId, p_draft_id: draftId,
  });
  if (error || !prepared) dbError(error, "messaging_prepare_send");

  const admin = new AdminApi();
  let token: string;
  try {
    token = unitToken(prepared.unit_code);
  } catch (err) {
    await admin.rpc("messaging_mark_result", { p_message_id: prepared.message_id, p_provider_id: null, p_error: "credencial ausente" });
    throw err;
  }

  const payload = prepared.template
    ? {
      messaging_product: "whatsapp", to: prepared.to, type: "template",
      template: {
        name: prepared.template.name, language: { code: prepared.template.language },
        ...(variables.length ? { components: [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: v })) }] } : {}),
      },
    }
    : { messaging_product: "whatsapp", to: prepared.to, type: "text", text: { body: prepared.body } };

  const res = await graphRequest(`/${prepared.phone_number_id}/messages`, token, { method: "POST", body: JSON.stringify(payload) });
  const providerId = (res.body.messages as { id: string }[] | undefined)?.[0]?.id ?? null;
  const errorText = res.ok && providerId ? null
    : ((res.body.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`);
  await admin.rpc("messaging_mark_result", { p_message_id: prepared.message_id, p_provider_id: providerId, p_error: errorText });
  if (errorText) throw new HttpError(502, "send_failed", "O WhatsApp recusou o envio");
  return json(req, 200, { ok: true, message_id: prepared.message_id });
}));
