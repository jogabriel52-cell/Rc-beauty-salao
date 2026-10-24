// Consultas compartilhadas pelas telas de pessoas e perfis de acesso.
import { supabase } from "../../lib/supabase";
import { unwrap } from "../../components/useAsync";
import type { Scope } from "../../lib/access";

export interface Permission {
  code: string;
  module: string;
  action: string;
  module_label: string;
  description: string;
  allowed_scopes: Scope[];
  sort_order: number;
}

export interface AccessProfile {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  requires_mfa: boolean;
  active: boolean;
}

export interface ProfilePermission {
  profile_id: string;
  permission_code: string;
  scope: Scope;
}

export interface Override {
  permission_code: string;
  effect: "grant" | "revoke";
  scope: Scope | null;
  reason: string;
}

export interface PersonMembership {
  membership_id: string;
  unit_id: string;
  unit_name: string;
  access_profile_id: string;
  access_profile_name: string;
  active: boolean;
  can_manage: boolean;
  overrides: Override[];
}

export interface Person {
  user_id: string;
  full_name: string;
  job_title: string | null;
  email: string;
  active: boolean;
  deactivated_at: string | null;
  deactivation_reason: string | null;
  is_platform_admin: boolean;
  mfa_enabled: boolean;
  last_sign_in_at: string | null;
  invited_at: string | null;
  memberships: PersonMembership[];
}

export interface Unit {
  id: string;
  code: string;
  name: string;
}

export async function loadCatalog() {
  const [perms, profiles, profilePerms, units] = await Promise.all([
    supabase.from("permissions").select("code, module, action, module_label, description, allowed_scopes, sort_order")
      .order("sort_order"),
    supabase.from("access_profiles").select("id, key, name, description, requires_mfa, active").order("name"),
    supabase.from("access_profile_permissions").select("profile_id, permission_code, scope"),
    supabase.from("units").select("id, code, name").eq("active", true).order("name"),
  ]);
  return {
    permissions: unwrap(perms) as unknown as Permission[],
    profiles: unwrap(profiles) as AccessProfile[],
    profilePermissions: unwrap(profilePerms) as ProfilePermission[],
    units: unwrap(units) as Unit[],
  };
}

export async function loadPeople(): Promise<Person[]> {
  return unwrap(await supabase.rpc("admin_list_people")) as unknown as Person[];
}

// Permissões efetivas de um vínculo (mesma regra do banco: revogação vence;
// senão, maior escopo entre perfil e concessão).
export function effectivePermissions(
  profileId: string,
  overrides: Override[],
  profilePermissions: ProfilePermission[],
): Record<string, Scope> {
  const result: Record<string, Scope> = {};
  for (const pp of profilePermissions.filter((p) => p.profile_id === profileId)) result[pp.permission_code] = pp.scope;
  for (const o of overrides) {
    if (o.effect === "revoke") delete result[o.permission_code];
    else if (o.scope === "unit" || !result[o.permission_code]) result[o.permission_code] = o.scope!;
  }
  for (const o of overrides) if (o.effect === "revoke") delete result[o.permission_code];
  return result;
}

export function groupByModule(perms: Permission[]): { module: string; label: string; items: Permission[] }[] {
  const groups = new Map<string, { module: string; label: string; items: Permission[] }>();
  for (const p of perms) {
    if (!groups.has(p.module)) groups.set(p.module, { module: p.module, label: p.module_label, items: [] });
    groups.get(p.module)!.items.push(p);
  }
  return [...groups.values()];
}

export const SCOPE_LABEL: Record<Scope, string> = { own: "Somente o próprio", unit: "Toda a unidade" };

export const ACTION_LABEL: Record<string, string> = {
  view: "Ver", create: "Criar", update: "Editar", archive: "Arquivar", manage: "Gerir", cancel: "Cancelar",
  merge: "Mesclar", write: "Registrar", open: "Abrir", edit: "Editar itens", finalize: "Finalizar", run: "Executar",
  reconcile: "Conciliar", send: "Enviar", configure: "Configurar", approve: "Aprovar", export: "Exportar",
};
