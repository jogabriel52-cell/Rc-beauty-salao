// Convida uma pessoa e cria perfil + vínculos por unidade.
// Contrato: docs/SERVER_FUNCTIONS.md#admin-invite-user
import { asObject, email, handler, HttpError, json, text, uuid } from "../_shared/http.ts";
import { AdminApi, dbError, requireCaller } from "../_shared/supabase.ts";

interface MembershipInput {
  unit_id: string;
  access_profile_id: string;
}

function parse(body: unknown) {
  const o = asObject(body, ["email", "full_name", "job_title", "memberships"]);
  if (!Array.isArray(o.memberships) || o.memberships.length < 1 || o.memberships.length > 20) {
    throw new HttpError(400, "invalid_field", "Informe de 1 a 20 unidades");
  }
  const memberships: MembershipInput[] = o.memberships.map((m) => {
    const mo = asObject(m, ["unit_id", "access_profile_id"]);
    return { unit_id: uuid(mo.unit_id, "unit_id"), access_profile_id: uuid(mo.access_profile_id, "access_profile_id") };
  });
  if (new Set(memberships.map((m) => m.unit_id)).size !== memberships.length) {
    throw new HttpError(400, "invalid_field", "Unidade repetida");
  }
  return {
    email: email(o.email),
    full_name: text(o.full_name, "full_name", 2, 160)!,
    job_title: text(o.job_title, "job_title", 2, 80, true),
    memberships,
  };
}

Deno.serve(handler("admin-invite-user", 8 * 1024, async (req, body) => {
  const caller = await requireCaller(req);
  const input = parse(body);

  // Pré-checagem amigável; a autorização definitiva é feita pelo banco.
  for (const m of input.memberships) {
    const { data, error } = await caller.api.rpc<boolean>("can_manage_access", { p_unit_id: m.unit_id });
    if (error) dbError(error, "can_manage_access");
    if (data !== true) throw new HttpError(403, "forbidden", "Sem permissão para gerir acessos nesta unidade");
  }

  const admin = new AdminApi();
  const { data: existingId, error: findError } = await admin.rpc<string | null>("admin_find_user_id_by_email", {
    p_email: input.email,
  });
  if (findError) dbError(findError, "admin_find_user_id_by_email");

  let userId = existingId;
  let invited = false;
  if (userId) {
    const { data: profiles, error } = await admin.select<{ id: string }[]>("profiles", `id=eq.${userId}&select=id`);
    if (error) dbError(error, "profiles lookup");
    if (profiles && profiles.length > 0) {
      throw new HttpError(409, "user_exists", "Já existe uma pessoa cadastrada com este e-mail");
    }
  } else {
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) throw new Error("SITE_URL não configurado");
    const { data, error, status } = await admin.inviteUserByEmail(
      input.email,
      `${siteUrl.replace(/\/$/, "")}/definir-senha`,
    );
    if (error || !data?.id) {
      console.error(JSON.stringify({ context: "invite", status }));
      throw new HttpError(502, "invite_failed", "Não foi possível enviar o convite");
    }
    userId = data.id;
    invited = true;
  }

  // Gravação com o JWT do chamador: RLS, anti-escalada e auditoria valem.
  const { error: provisionError } = await caller.api.rpc("admin_provision_person", {
    p_user_id: userId,
    p_full_name: input.full_name,
    p_job_title: input.job_title,
    p_memberships: input.memberships,
  });
  if (provisionError) dbError(provisionError, "admin_provision_person");

  return json(req, 201, { ok: true, user_id: userId, invited });
}));
