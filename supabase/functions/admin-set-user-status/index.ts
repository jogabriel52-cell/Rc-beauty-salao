// Desativa ou reativa uma pessoa.
// Contrato: docs/SERVER_FUNCTIONS.md#admin-set-user-status
//
// Ordem: primeiro o banco (com o JWT do chamador: as regras de quem pode
// desativar quem são impostas por gatilho), depois o bloqueio no Auth.
// Desativar no banco já corta o acesso a dados mesmo com sessão aberta.
import { asObject, handler, HttpError, json, text, uuid } from "../_shared/http.ts";
import { AdminApi, dbError, requireCaller } from "../_shared/supabase.ts";

Deno.serve(handler("admin-set-user-status", 4 * 1024, async (req, body) => {
  const caller = await requireCaller(req);
  const o = asObject(body, ["user_id", "active", "reason"]);
  const userId = uuid(o.user_id, "user_id");
  if (typeof o.active !== "boolean") throw new HttpError(400, "invalid_field", "active deve ser verdadeiro ou falso");
  const active = o.active;
  const reason = active ? null : text(o.reason, "reason", 3, 500);

  if (caller.userId === userId) {
    throw new HttpError(400, "cannot_change_self", "Ninguém pode ativar ou desativar a si mesmo");
  }

  const { data, error } = await caller.api.update<{ id: string }[]>(
    "profiles",
    `id=eq.${userId}&select=id`,
    active ? { active: true } : { active: false, deactivation_reason: reason },
  );
  if (error) {
    if (error.code === "42501" && /último Admin Geral/.test(error.message ?? "")) {
      throw new HttpError(409, "last_admin", error.message);
    }
    dbError(error, "profiles update");
  }
  if (!data || data.length === 0) throw new HttpError(404, "not_found", "Pessoa não encontrada");

  const { error: banError, status: banStatus } = await new AdminApi().updateUser(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) {
    console.error(JSON.stringify({ context: "updateUser", status: banStatus }));
    throw new HttpError(
      502,
      "auth_block_failed",
      active
        ? "Pessoa reativada no sistema, mas o desbloqueio do login falhou. Tente novamente."
        : "Acesso aos dados já foi cortado, mas o bloqueio do login falhou. Tente novamente.",
    );
  }

  return json(req, 200, { ok: true });
}));
