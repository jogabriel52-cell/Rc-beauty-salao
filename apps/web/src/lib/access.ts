// Tipos e utilitários do acesso do usuário atual (função my_access do banco).
// Servem apenas para a interface mostrar/esconder ações: a autorização real é
// feita por RLS no banco.
export type Scope = "own" | "unit";

export interface UnitAccess {
  unit_id: string;
  code: string;
  name: string;
  access_profile: string;
  permissions: Record<string, Scope>;
}

export interface MyAccess {
  user_id: string;
  full_name: string;
  active: boolean;
  is_platform_admin: boolean;
  mfa_required: boolean;
  aal: "aal1" | "aal2";
  can_manage_templates: boolean;
  units: UnitAccess[];
}

export function can(unit: UnitAccess | null | undefined, permission: string, scope?: Scope): boolean {
  const s = unit?.permissions[permission];
  if (!s) return false;
  if (scope === "unit") return s === "unit";
  return true;
}

export function canAny(unit: UnitAccess | null | undefined, permissions: string[]): boolean {
  return permissions.some((p) => can(unit, p));
}

export function canManageAnyUnit(access: MyAccess | null): boolean {
  return !!access && access.units.some((u) => can(u, "access.manage"));
}
