// Verificações do canal oficial, exigidas antes da ativação:
//   action "credentials": confirma na Graph API que o token da unidade acessa o número cadastrado;
//   action "test": envia um modelo de mensagem aprovado a um número de teste da equipe.
// Somente quem tem messaging.manage na unidade. Sem credenciais: 503.
import { asObject, handler, HttpError, json, text, uuid } from "../_shared/http.ts";
import { AdminApi, dbError, requireCaller } from "../_shared/supabase.ts";
import { graphRequest, unitToken } from "../_shared/whatsapp.ts";

Deno.serve(handler("whatsapp-verify-channel", 4 * 1024, async (req, body) => {
  const caller = await requireCaller(req);
  const o = asObject(body, ["unit_id", "action", "to", "template_name", "template_language"]);
  const unitId = uuid(o.unit_id, "unit_id");
  if (o.action !== "credentials" && o.action !== "test") throw new HttpError(400, "invalid_field", "action inválida");

  const { data: allowed, error: permError } = await caller.api.rpc<boolean>("has_permission", {
    p_unit_id: unitId, p_permission: "messaging.manage",
  });
  if (permError) dbError(permError, "has_permission");
  if (allowed !== true) throw new HttpError(403, "forbidden", "Sem permissão para configurar o canal");

  const { data: rows, error } = await caller.api.select<{ phone_number_id: string | null; credentials_verified_at: string | null; units: { code: string } }[]>(
    "messaging_channels", `unit_id=eq.${unitId}&select=phone_number_id,credentials_verified_at,units(code)`);
  if (error) dbError(error, "messaging_channels");
  const channel = rows?.[0];
  if (!channel?.phone_number_id) throw new HttpError(400, "not_configured", "Cadastre o ID do número do WhatsApp antes de verificar");
  const token = unitToken(channel.units.code);
  const admin = new AdminApi();

  if (o.action === "credentials") {
    const res = await graphRequest(`/${channel.phone_number_id}?fields=display_phone_number,verified_name`, token);
    if (!res.ok) throw new HttpError(502, "verification_failed", "A Graph API não confirmou o acesso ao número");
    await admin.rpc("messaging_mark_channel", { p_unit_code: channel.units.code, p_field: "credentials" });
    return json(req, 200, { ok: true, verified: "credentials" });
  }

  if (!channel.credentials_verified_at) throw new HttpError(400, "credentials_first", "Verifique as credenciais primeiro");
  const to = text(o.to, "to", 10, 15)!.replace(/\D/g, "");
  const name = text(o.template_name, "template_name", 3, 100)!;
  const language = text(o.template_language, "template_language", 2, 10)!;
  const res = await graphRequest(`/${channel.phone_number_id}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name, language: { code: language } } }),
  });
  if (!res.ok) throw new HttpError(502, "test_failed", "O envio de teste falhou");
  await admin.rpc("messaging_mark_channel", { p_unit_code: channel.units.code, p_field: "test" });
  return json(req, 200, { ok: true, verified: "test" });
}));
